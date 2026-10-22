import AsyncStorage from '@react-native-async-storage/async-storage';
import { toApiError } from './errors';
import { logger } from '../../utils/logger';

/**
 * 오프라인 쓰기 큐.
 *
 * 이 앱은 현장(공장·건설현장)에서 쓰인다 — 지하·철골 구조물 안에서는 신호가 끊기기 쉽다.
 * 출석 도장·학습 완료·신고처럼 "사용자가 이미 했다고 믿는 행동"이 네트워크 때문에
 * 조용히 사라지면 신뢰를 잃는다.
 *
 * 그래서 쓰기 요청이 '재시도할 가치가 있는 실패'(연결 없음·서버 일시 오류)로 끝나면
 * 디스크에 쌓아두고, 다음 기회(앱 복귀·다음 쓰기 성공·명시적 flush)에 다시 보낸다.
 *
 * 설계 원칙
 *  · 재시도해도 안전하도록, 각 항목에 멱등키(idempotencyKey)를 붙여 보낸다.
 *    서버는 같은 키의 중복 요청을 한 번만 반영해야 한다(계약서 참조).
 *  · 입력 오류(400)·권한 오류(401/403)처럼 다시 보내도 실패할 요청은 큐에 넣지 않고 버린다.
 *  · 큐가 무한정 커지지 않도록 최대 길이·최대 시도 횟수를 둔다.
 */

export interface QueuedWrite {
  id: string;
  /** 'POST' | 'PATCH' | 'DELETE' */
  method: string;
  path: string;
  body?: unknown;
  /** 서버 중복 반영 방지용 키 */
  idempotencyKey: string;
  createdAt: number;
  attempts: number;
  /**
   * 이 쓰기를 만든 사람. 현장 태블릿은 여러 명이 돌려 쓴다 —
   * 소유자를 안 붙이면 A 가 오프라인에서 찍은 출석이 B 의 토큰으로 전송된다.
   */
  userId?: string;
  sourceId?: string;
}

const STORAGE_KEY = 'offline-write-queue';

/**
 * 접두사가 바뀌기 전(`/api/...`)에 쌓인 항목을 지금 주소로 옮긴다.
 *
 * 리버스 프록시의 location 블록이 바뀌면서 앱이 부르는 주소가 통째로
 * `/inner/api/v1` 아래로 옮겨졌다. 그 전에 큐에 들어간 출석·채점 기록은 업데이트
 * 뒤에 옛 주소로 나가 **404** 를 받는데, 404 는 '다시 보내도 소용없는 실패'라
 * 큐가 그대로 버린다 — 사용자는 이미 찍었다고 믿는 출석이 조용히 사라진다.
 * 유실 방지가 존재 이유인 큐에서 그건 있을 수 없어, 읽어 들일 때 한 번 고쳐 준다.
 *
 * (구버전 앱이 남긴 디스크만 해당한다. 큐를 다 비운 뒤에는 아무 일도 하지 않는다.)
 */
const LEGACY_PATH_PREFIX = '/api/';
const PATH_PREFIX = '/inner/api/v1/';

function isQueuedWrite(value: unknown): value is QueuedWrite {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<QueuedWrite>;
  return typeof item.id === 'string' && item.id.length > 0
    && typeof item.method === 'string' && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(item.method)
    && typeof item.path === 'string' && item.path.startsWith('/') && !item.path.startsWith('//')
    && typeof item.idempotencyKey === 'string' && item.idempotencyKey.length > 0
    && typeof item.createdAt === 'number' && Number.isFinite(item.createdAt) && item.createdAt >= 0
    && typeof item.attempts === 'number' && Number.isSafeInteger(item.attempts) && item.attempts >= 0
    && (item.userId === undefined || typeof item.userId === 'string' && item.userId.length > 0)
    && (item.sourceId === undefined || typeof item.sourceId === 'string' && item.sourceId.length > 0);
}

function migrateLegacyPath(item: QueuedWrite): QueuedWrite {
  if (typeof item?.path !== 'string' || !item.path.startsWith(LEGACY_PATH_PREFIX)) return item;
  return { ...item, path: PATH_PREFIX + item.path.slice(LEGACY_PATH_PREFIX.length) };
}

/** 큐 최대 길이 — 넘치면 가장 오래된 항목부터 버린다(무한 성장 방지). */
export const MAX_QUEUE = 100;
/**
 * 이 횟수만큼 **서버에 닿고도** 실패하면 포기한다(영구 실패 항목이 큐를 막지 않도록).
 *
 * ── 연결이 없던 것은 시도로 세지 않는다 ──────────────────────────────────
 * 예전에는 실패면 무조건 attempts 를 올렸다. 그런데 status 0(연결 없음)도 실패다.
 * 큐는 앱이 앞으로 나올 때마다 흘려보내므로(useAppResume), **지하 현장에서 앱을
 * 다섯 번 열기만 하면** 아직 한 번도 서버에 닿아 보지 못한 출석 도장이
 * '너무 많이 실패했다'며 버려졌다. 유실을 막으려고 만든 큐가 유실의 원인이 되는
 * 셈이고, 하필 이 앱이 가장 자주 놓이는 상황이 바로 그 상황이다.
 *
 * 그래서 세는 것은 '서버가 지금은 안 된다고 답한 횟수'뿐이다(5xx·429).
 * 닿지 못한 항목은 연결이 돌아올 때까지 그대로 기다린다 — 영영 안 돌아와도
 * MAX_QUEUE 상한에 밀려 결국 빠지므로 큐가 무한히 자라지는 않는다.
 */
export const MAX_ATTEMPTS = 5;

let memory: QueuedWrite[] = [];
let loaded = false;
// 최초 디스크 로드는 single-flight 로 공유한다. 이게 없으면 로드가 끝나는 순간
// memory 가 디스크 내용으로 통째 교체되면서, 그 사이에 들어온 쓰기가 증발한다.
let loading: Promise<void> | null = null;
let flushing = false;
let flushInFlight: Promise<number> | null = null;
// 지금 로그인한 사람. authStore 가 세션이 바뀔 때마다 갱신한다.
let ownerId: string | null = null;
let sourceId: string | undefined;

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function persist(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // 저장 실패는 치명적이지 않다 — 메모리 큐만으로 이번 세션은 동작한다.
  }
}

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  if (!loading) {
    loading = (async () => {
      let restored: QueuedWrite[] = [];
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        // A damaged entry must not strand all the valid attendance/learning writes.
        if (Array.isArray(parsed)) restored = parsed.filter(isQueuedWrite).map(migrateLegacyPath);
      } catch {
        // 손상된 큐는 버린다(앱 시작을 막지 않는다).
      }
      // 읽는 동안 들어온 항목은 덮어쓰지 않고 디스크 내용 뒤에 붙인다.
      // (디스크에 있던 것이 먼저 생긴 요청이므로 순서상 앞이다.)
      memory = restored.concat(memory);
      if (memory.length > MAX_QUEUE) memory = memory.slice(memory.length - MAX_QUEUE);
      loaded = true;
      loading = null;
    })();
  }
  await loading;
}

/** 대기 중인 쓰기 개수 — 화면에서 '전송 대기 n건' 표시에 쓸 수 있다. */
export async function pendingCount(): Promise<number> {
  await ensureLoaded();
  return memory.length;
}

/** 큐 비우기(로그아웃·초기화 시). */
export async function clearQueue(): Promise<void> {
  await ensureLoaded();
  memory = [];
  await persist();
}

/**
 * 큐의 주인을 알려준다. 세션이 바뀌면(로그인·로그아웃·세션 복구) 반드시 호출해야
 * 앞사람이 남긴 쓰기가 뒷사람 토큰으로 나가지 않는다.
 */
export function setQueueOwner(userId: string | null, source?: string): void {
  ownerId = userId;
  sourceId = source;
}

/** 쓰기 요청을 큐에 넣는다. 넣은 항목의 멱등키를 돌려준다. */
export async function enqueue(
  method: string,
  path: string,
  body?: unknown,
  idempotencyKey?: string,
): Promise<string> {
  const requestOwner = ownerId;
  const requestSource = sourceId;
  await ensureLoaded();
  const key = idempotencyKey ?? newId();
  memory.push({
    id: newId(),
    method,
    path,
    body,
    idempotencyKey: key,
    createdAt: Date.now(),
    attempts: 0,
    userId: requestOwner ?? undefined,
    sourceId: requestSource,
  });
  // 오래된 것부터 버려 상한을 지킨다.
  if (memory.length > MAX_QUEUE) memory = memory.slice(memory.length - MAX_QUEUE);
  await persist();
  logger.info('offline_write_queued', { path, method, queued: memory.length });
  return key;
}

/** 큐를 실제로 전송하는 함수 — ApiClient 가 주입한다(순환 참조 방지). */
export type QueueSender = (item: QueuedWrite) => Promise<void>;

let sender: QueueSender | null = null;
export function setQueueSender(fn: QueueSender): void {
  sender = fn;
}

/**
 * 큐를 앞에서부터 전송한다. 한 항목이 '재시도 가치 있는 실패'로 끝나면
 * 그 자리에서 멈춘다 — 순서를 보존하고, 오프라인일 때 큐 전체를 헛되이 소모하지 않는다.
 * 반환값은 이번에 성공적으로 보낸 개수.
 */
export function flushQueue(): Promise<number> {
  if (flushInFlight) return flushInFlight;
  const flight = flushPendingQueue().finally(() => { if (flushInFlight === flight) flushInFlight = null; });
  flushInFlight = flight;
  return flight;
}

export async function hasPendingWrites(): Promise<boolean> {
  await ensureLoaded();
  return nextSendable() !== undefined;
}

async function flushPendingQueue(): Promise<number> {
  await ensureLoaded();
  if (flushing || !sender || memory.length === 0) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (;;) {
      const item = nextSendable();
      if (!item) break;
      try {
        await sender(item);
        removeById(item.id);
        sent += 1;
      } catch (e) {
        const err = toApiError(e);
        // 계정 전환 중 취소된 항목은 원래 주인이 돌아올 때 전송한다.
        if (err.kind === 'cancelled') break;
        // 서버에 닿지 못한 것은 이 항목의 잘못이 아니다 — 시도로 세지 않는다.
        if (err.kind !== 'offline') item.attempts += 1;
        if (!err.retryable || item.attempts >= MAX_ATTEMPTS) {
          // 다시 보내도 소용없거나 너무 많이 실패했다 → 버리고 다음으로 넘어간다.
          removeById(item.id);
          logger.warn('offline_write_dropped', {
            path: item.path,
            status: err.status,
            attempts: item.attempts,
          });
          continue;
        }
        // 일시적 실패 — 순서를 지키기 위해 여기서 중단하고 다음 기회를 기다린다.
        break;
      }
    }
    if (sent > 0) logger.info('offline_write_flushed', { sent, remaining: memory.length });
    return sent;
  } finally {
    await persist();
    flushing = false;
  }
}

/**
 * 지금 보낼 수 있는 가장 오래된 항목. 다른 사람이 남긴 쓰기는 건너뛴다 —
 * 지금 붙어 있는 토큰은 그 사람 것이 아니라, 보내면 기록이 엉뚱한 계정에 붙는다.
 * 지우지 않고 남겨 두는 이유는 본인이 다시 로그인하면 그때 정상 전송되기 때문이다
 * (영영 안 돌아와도 MAX_QUEUE 상한에 밀려 결국 빠진다).
 */
function nextSendable(): QueuedWrite | undefined {
  return memory.find((q) => (!q.userId || q.userId === ownerId) && (!q.sourceId || q.sourceId === sourceId));
}

/**
 * 처리한 항목을 id 로 지운다.
 *
 * shift() 로 맨 앞을 자르지 않는 이유: 전송을 기다리는(await) 사이에 로그아웃
 * (clearQueue)이나 새 쓰기(enqueue)가 끼어들면 맨 앞이 더 이상 방금 보낸 항목이
 * 아닐 수 있다. 그때 shift() 는 아직 보내지도 않은 남의 기록을 지운다.
 */
function removeById(id: string): void {
  const idx = memory.findIndex((q) => q.id === id);
  if (idx >= 0) memory.splice(idx, 1);
}

/** 테스트용 — 모듈 상태를 초기화한다. */
export function __resetQueueForTests(): void {
  memory = [];
  loaded = false;
  loading = null;
  flushing = false;
  flushInFlight = null;
  sender = null;
  ownerId = null;
  sourceId = undefined;
}
