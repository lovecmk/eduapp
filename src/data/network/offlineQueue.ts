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
}

const STORAGE_KEY = 'offline-write-queue';
/** 큐 최대 길이 — 넘치면 가장 오래된 항목부터 버린다(무한 성장 방지). */
export const MAX_QUEUE = 100;
/** 이 횟수만큼 실패하면 포기한다(영구 실패 항목이 큐를 막지 않도록). */
export const MAX_ATTEMPTS = 5;

let memory: QueuedWrite[] = [];
let loaded = false;
let flushing = false;

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
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    memory = Array.isArray(parsed) ? (parsed as QueuedWrite[]) : [];
  } catch {
    memory = []; // 손상된 큐는 버린다(앱 시작을 막지 않는다).
  }
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

/** 쓰기 요청을 큐에 넣는다. 넣은 항목의 멱등키를 돌려준다. */
export async function enqueue(
  method: string,
  path: string,
  body?: unknown,
  idempotencyKey?: string,
): Promise<string> {
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
export async function flushQueue(): Promise<number> {
  await ensureLoaded();
  if (flushing || !sender || memory.length === 0) return 0;
  flushing = true;
  let sent = 0;
  try {
    while (memory.length > 0) {
      const item = memory[0];
      try {
        await sender(item);
        memory.shift();
        sent += 1;
      } catch (e) {
        const err = toApiError(e);
        item.attempts += 1;
        if (!err.retryable || item.attempts >= MAX_ATTEMPTS) {
          // 다시 보내도 소용없거나 너무 많이 실패했다 → 버리고 다음으로 넘어간다.
          memory.shift();
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

/** 테스트용 — 모듈 상태를 초기화한다. */
export function __resetQueueForTests(): void {
  memory = [];
  loaded = false;
  flushing = false;
  sender = null;
}
