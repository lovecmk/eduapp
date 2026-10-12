import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';
import { queryClient } from '../data/network/queryClient';
import { resetUserScopedStores } from './resetAppData';

/**
 * 로컬에 남는 데이터의 '주인'을 강제한다 — 공용 기기 대응의 잃어버린 반쪽.
 *
 * 배경: 오프라인 큐(data/network/offlineQueue)는 항목마다 주인을 붙여 A 가 찍은
 * 출석이 B 의 토큰으로 나가지 않게 막는다. 그런데 **persist 스토어에는 그 개념이
 * 아예 없었다.** zustand persist 키(`srs-scheduler`·`attendance`·`collection`·
 * `daily-learning` …)는 전부 기기 단위 전역이고, 로그아웃은 토큰만 지운다.
 *
 * 그래서 현장 태블릿에서 A 가 로그아웃하고 B 가 로그인하면 B 는
 *  · A 의 복습 스케줄(srsStore)을 자기 복습 탭에서 보고,
 *  · A 가 이미 써 버린 하루 학습 상한(dailyLearningStore)을 물려받고,
 *  · A 의 출석 도장으로 연속출석 성취가 잘못 발화하고,
 *  · 실서버 모드에서는 그 로컬 진행도가 **B 의 토큰으로 서버에 동기화**되어
 *    안전교육 이력이 엉뚱한 사람에게 붙는다(가장 치명적인 3차 파급).
 *
 * 여기서 세션의 주인을 디스크에 기록해 두고, 주인이 바뀐 채로 로그인이 일어나면
 * 사용자 종속 데이터를 메모리·디스크에서 한 번에 비운다.
 *
 * 설계 선택 두 가지:
 *  1) **로그아웃 시점에는 지우지 않는다.** 개인 기기에서 잠깐 로그아웃했다가 같은
 *     사람이 다시 들어오는 경우가 훨씬 흔한데, 그때마다 복습 스케줄을 날리면
 *     안전장치가 아니라 데이터 파괴다. 큐와 같은 모델 — '지우기'가 아니라 '주인 표시'.
 *  2) **주인을 읽지 못하면 지운다(fail-closed).** 저장소를 못 읽는 상황에서는
 *     같은 사람임을 증명할 수 없다. 오귀속된 안전교육 이력보다 로컬 캐시 손실이 낫다
 *     (저장소가 정말 깨졌다면 persist 복원도 안 됐을 테니 지울 것도 없다).
 */

const USER_SCOPED_CACHE_KEYS = ['live-daily-assignment'];

const OWNER_KEY = 'session-owner-id';

/**
 * 사용자에게 종속된 persist 키 — 주인이 바뀌면 디스크에서도 지운다.
 * (기기 설정인 `app-settings`·`app-moments` 는 사람이 바뀌어도 유지한다.)
 *
 * ⚠️ 사용자 데이터를 담는 persist 스토어를 새로 만들면 이 목록에 반드시 추가할 것.
 */
export const USER_SCOPED_PERSIST_KEYS = [
  'attendance',
  'authored-cards',
  'bookmarks',
  'card-progress',
  'card-likes',
  'card-reports',
  'card-tips',
  'collection',
  'daily-learning',
  'diff-poll',
  'faction',
  'notifications',
  'qna',
  'share-feed',
  'srs-scheduler',
] as const;

/** 아직 디스크에서 읽지 않았음을 `undefined` 로 구분한다(값이 없는 상태는 `null`). */
let owner: string | null | undefined;

/**
 * 세션 전환은 서로 겹칠 수 있다 — 부팅 직후 `restore()` 가 도는 중에 사용자가
 * 로그인 버튼을 누르면 두 흐름이 동시에 주인을 바꾼다. 순서가 뒤집히면 지워야 할
 * 데이터를 남기거나(더 나쁨) 남겨야 할 데이터를 지운다. 그래서 직렬화한다.
 */
let chain: Promise<unknown> = Promise.resolve();

function purgeUserScopedData(): void {
  // 1) 메모리 — persist 스토어는 setState 시 디스크에 다시 써지므로 여기서 대부분 정리된다.
  //
  // 지울 목록을 여기서 손으로 나열하지 않는다. 예전에는 resetLearningStores() 를
  // 부른 뒤 빠진 세 개(qna·share-feed·card-tips)를 이 자리에 덧붙여 두었는데,
  // 그 덧붙임이 '전체 초기화'(설정 화면) 경로에는 없어서 같은 세 스토어가 그쪽에서는
  // 메모리에 살아남았다. 같은 목록을 두 곳에서 관리하면 반드시 한쪽이 뒤처진다 —
  // 목록은 resetAppData 한 곳에만 둔다.
  //
  // 기기 단위 기록(app-moments)은 여기서 건드리지 않는다. 사람이 바뀌어도 그 기기의
  // 첫 실행 시각·누적 실행 횟수는 그대로다(USER_SCOPED_PERSIST_KEYS 주석과 같은 기준).
  // 예전에는 이것까지 함께 비워, 지우지도 않을 디스크 값을 메모리에서만 0 으로 만들고
  // 그 0 이 곧바로 디스크에 다시 써지고 있었다.
  resetUserScopedStores();
  // 2) 서버 응답 캐시 — 프로필·통계·커뮤니티는 앞사람 응답이 그대로 들어 있다.
  queryClient.clear();
}

async function purgeDisk(): Promise<void> {
  // 메모리 초기화만으로는 부족한 경우가 있다: 아직 rehydrate 되지 않은 스토어는
  // setState 를 해도 나중에 디스크 값으로 덮어써진다. 키를 직접 지워 그 창을 닫는다.
  try {
    await AsyncStorage.multiRemove([...USER_SCOPED_PERSIST_KEYS, ...USER_SCOPED_CACHE_KEYS]);
  } catch {
    // 디스크를 못 지워도 메모리는 이미 비었다 — 이번 세션은 안전하다.
  }
}

async function readOwner(): Promise<string | null | 'unknown'> {
  try {
    return await AsyncStorage.getItem(OWNER_KEY);
  } catch {
    return 'unknown';
  }
}

async function apply(userId: string | null, source?: string): Promise<void> {
  if (owner === undefined) {
    const stored = await readOwner();
    // 읽지 못했으면 '같은 사람'임을 증명할 수 없다 → 다른 사람으로 취급(fail-closed).
    owner = stored === 'unknown' ? '__unreadable__' : stored;
  }

  // 로그아웃: 데이터는 남기고 주인 표시만 유지한다(위 설계 선택 1).
  if (userId === null) {
    // 로그인 화면으로 나가는 순간 앞사람의 서버 응답 캐시는 더 이상 유효하지 않다.
    // (설정 화면 로그아웃만 지우고 헤더 메뉴 로그아웃은 안 지우던 불일치를 여기서 없앤다.)
    queryClient.clear();
    return;
  }

  let sourceChanged = false;
  if (source !== undefined) {
    try {
      const previous = await AsyncStorage.getItem('session-data-source');
      sourceChanged = previous !== null && previous !== source;
    } catch { sourceChanged = true; }
  }
  if (sourceChanged || owner !== null && owner !== userId) {
    // 앞사람의 흔적이 남은 채 다른 사람이 들어왔다.
    // (로그아웃 없이 계정 전환·세션 만료 후 재로그인·앱 강제종료 모두 이 경로다.)
    logger.warn('session_owner_changed_purged', { keys: USER_SCOPED_PERSIST_KEYS.length });
    purgeUserScopedData();
    await purgeDisk();
  }

  owner = userId;
  try {
    await AsyncStorage.setItem(OWNER_KEY, userId);
    if (source !== undefined) await AsyncStorage.setItem('session-data-source', source);
  } catch {
    // 다음 로그인에서 주인을 못 읽으면 fail-closed 로 한 번 더 지울 뿐이다.
  }
}

/**
 * 세션 주인을 적용한다. authStore 의 모든 세션 전환(login·socialLogin·register·
 * restore·logout)이 이 함수를 거치므로, 로그아웃 경로를 새로 만들어도 정리가 빠지지 않는다.
 *
 * 호출부는 반드시 **await 한 뒤에** 사용자 상태를 set 해야 한다 — 그래야 새 사용자의
 * 화면이 앞사람 데이터를 한 프레임이라도 그리지 않는다.
 */
export function applySessionOwner(userId: string | null, source?: string): Promise<void> {
  const next = chain.then(
    () => apply(userId, source),
    () => apply(userId, source),
  );
  chain = next.catch(() => undefined);
  return next;
}

/** 데이터 초기화(설정 → 초기화) 후처럼 주인 기록 자체를 지워야 할 때. */
export async function clearSessionOwner(): Promise<void> {
  owner = null;
  try {
    await AsyncStorage.removeItem(OWNER_KEY);
  } catch {
    /* 다음 로그인에서 fail-closed 로 정리된다 */
  }
}

/** 테스트용 — 모듈 상태를 초기화한다. */
export function __resetSessionScopeForTests(): void {
  owner = undefined;
  chain = Promise.resolve();
}
