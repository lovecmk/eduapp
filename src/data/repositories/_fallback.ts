// 부분 배포용 우아한 폴백 — 서버에 아직 없는 엔드포인트를 조용히 목업으로 대체.
//
// 배경: 날씨/쿼터/디렉터리처럼 "있으면 좋지만 없어도 앱은 돌아가야 하는" 보조 기능은
// 백엔드가 단계적으로(부분) 배포되는 동안 아직 서버에 라우트가 없을 수 있다.
// 이때 실서버 모드(env.useMockData=false)라도 해당 기능만 조용히 목업으로 떨어뜨려
// 화면이 에러로 깨지지 않게 한다. 나머지 엔드포인트가 준비되면 자동으로 실서버를 쓴다.
//
// ⚠️ 인증/카드/통계처럼 목업이 실데이터를 위장하면 안 되는 '핵심' 기능에는 쓰지 않는다.
//    (그쪽은 에러가 사용자에게 정직하게 드러나야 한다.) 여기서 감싸는 대상은
//    index.ts 에서 명시한 보조 기능(weather/quota/directory)뿐이다.
import { ApiError } from '../network/errors';
import { logger } from '../../utils/logger';

// '라우트가 없다'고 서버가 답한 상태 코드.
//  · 404 Not Found        — 그 경로가 없다.
//  · 501 Not Implemented  — 서버가 명시적으로 미구현이라고 답함.
const NOT_DEPLOYED_STATUS = new Set([404, 501]);

// '지금 못 닿았다'는 신호 — 답이 몇 초 뒤에 달라질 수 있다.
//  · 0            — ApiClient 가 정규화한 연결 없음/타임아웃.
//  · 502/503/504  — 게이트웨이 오류·서비스 재기동·과부하.
const TRANSIENT_STATUS = new Set([0, 502, 503, 504]);

/**
 * 일시적 실패로 목업에 내려간 뒤, 이 시간이 지나면 실서버를 한 번 더 확인한다.
 * (지하에서 잠깐 끊긴 것 때문에 지상으로 나온 뒤에도 계속 목업을 쓰면 안 된다.)
 */
export const TRANSIENT_RETRY_MS = 60_000;

/**
 * 404/501 로 목업에 내려간 뒤 다시 확인하기까지의 시간.
 *
 * ── 왜 '영구 래치'를 걷어냈나 ──────────────────────────────────────────────
 * 예전에는 404 를 받으면 그 기능을 **프로세스가 죽을 때까지** 목업에 가뒀다.
 * 앱이 부르는 경로가 아직 서버에 없던 시절에는 맞는 판단이었다. 지금은 아니다 —
 * 라우트는 전부 서버에 있고, 그러므로 404 는 '아직 안 만들었다'가 아니라
 * **접두사 불일치·프록시 설정 실수·라우트 회귀**, 즉 진짜 사고의 신호다.
 *
 * 영구 래치는 그 사고를 가장 나쁜 방식으로 감춘다. 첫 요청 하나가 404 로
 * 돌아오면 앱은 그 뒤로 아무것도 묻지 않고 가짜 데이터를 계속 보여주고,
 * 서버가 고쳐져도 앱을 껐다 켜기 전까지는 영영 돌아오지 않는다. 화면이 멀쩡해
 * 보이는 것이 이 사고의 가장 나쁜 점이다.
 *
 * 그래서 404 도 '다시 물어볼 실패'로 다룬다. 다만 일시적 단절보다는 길게 둔다 —
 * 정말 없는 경로라면 1분마다 두드려도 답은 같고, 배포로 열리는 데는 그보다
 * 오래 걸린다. 강등 장부에는 여전히 'not-deployed' 로 남아, 개발자 화면에서
 * '못 닿음'과 구분된다(전자는 배포가 필요하고 후자는 기다리면 된다).
 */
export const NOT_DEPLOYED_RETRY_MS = 5 * 60_000;

/** 어떤 기능이 왜 목업으로 돌고 있는가 — 개발자 화면이 읽는 실시간 장부. */
export interface Degradation {
  /** 저장소 라벨(weather · qna · settings …) */
  label: string;
  reason: 'not-deployed' | 'unreachable';
  /** 처음 강등된 시각(epoch ms) */
  since: number;
}

const degradations = new Map<string, Degradation>();

/**
 * 장부가 바뀔 때 알림을 받을 구독자들.
 *
 * 개발자 화면은 주기적으로 다시 읽어도 되지만, 사용자 화면의 안내 배너는 그럴 수
 * 없다 — 강등은 '첫 요청이 404 로 돌아온 순간' 일어나므로, 화면이 이미 그려진 뒤다.
 * 구독이 없으면 배너는 다음에 그 화면을 다시 열 때에야 나타난다.
 */
const listeners = new Set<() => void>();

/** 장부 변경 구독 — useSyncExternalStore 용. 해지 함수를 돌려준다. */
export function subscribeDegradations(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * 특정 기능이 지금 목업으로 돌고 있는가.
 *
 * useSyncExternalStore 의 getSnapshot 으로 그대로 쓸 수 있도록 원시값(boolean)을
 * 돌려준다 — 객체를 돌려주면 매번 새 참조라 렌더가 멈추지 않는다.
 */
export function isDegraded(label: string): boolean {
  return degradations.has(label);
}

/**
 * 강등 목록을 읽는다.
 *
 * 폴백은 조용한 게 미덕이지만, **아무도 모르는 조용함은 사고**다. 로그 한 줄로만
 * 남기면 "왜 내가 올린 질문이 다른 기기에서 안 보이지?"의 답을 찾을 방법이
 * 사용자에게도 운영자에게도 없다. 개발자 화면이 이 목록을 그대로 보여준다.
 */
export function listDegradations(): Degradation[] {
  return [...degradations.values()].sort((a, b) => a.since - b.since);
}

/** 테스트용 — 모듈 전역 장부를 비운다. */
export function __resetDegradationsForTests(): void {
  degradations.clear();
  listeners.forEach((l) => l());
}

/**
 * 이번 호출이 '서버에 닿지 못한 것'인지 — 즉 목업으로 대체해도 되는 실패인지.
 * (영구·일시 구분 없이 판단만 한다. 재시도 정책은 withMockFallback 이 정한다.)
 */
export function isEndpointUnavailable(e: unknown): boolean {
  return (
    e instanceof ApiError && (TRANSIENT_STATUS.has(e.status) || NOT_DEPLOYED_STATUS.has(e.status))
  );
}

/**
 * 폴백 사유 — 목업으로 대체해도 되는 실패인지, 그렇다면 무엇 때문인지.
 *
 * 둘 다 '다시 물어본다'는 점은 같고 **기다리는 시간과 화면에 적히는 말**이
 * 다르다. 사유를 지우지 않는 이유는 개발자 화면 때문이다 — 못 닿은 것은
 * 기다리면 되고, 라우트가 없는 것은 누군가 배포를 해야 한다.
 */
function classify(e: unknown): 'not-deployed' | 'unreachable' | null {
  if (!(e instanceof ApiError)) return null;
  if (NOT_DEPLOYED_STATUS.has(e.status)) return 'not-deployed';
  if (TRANSIENT_STATUS.has(e.status)) return 'unreachable';
  return null;
}

/**
 * 실서버 저장소(live)를 감싸, 엔드포인트가 아직 없을 때 조용히 목업(mock)으로 위임하는
 * 프록시를 만든다.
 *
 * **어떤 실패든 언젠가는 다시 물어본다.** 한 번 걸리면 프로세스가 죽을 때까지 목업에
 * 갇히는 길은 없다. 이 앱은 지하·철골 구조물에서 쓰여 순간 단절이 일상이고, 서버 쪽
 * 사고도 대개 고쳐진다. 돌아오지 못하는 폴백은 장애가 끝난 뒤에도 가짜 데이터를
 * 보여주면서 사용자에게도 운영자에게도 그 사실을 숨긴다.
 *  · 0/502/503/504(못 닿음)   → `TRANSIENT_RETRY_MS` 뒤 재확인.
 *  · 404/501(라우트 없음)     → `NOT_DEPLOYED_RETRY_MS` 뒤 재확인(더 길게).
 *
 * live/mock 은 같은 인터페이스 T 를 구현하므로 메서드 시그니처가 정확히 일치한다.
 * 저장소 메서드는 모두 Promise 를 반환하므로 비동기 거부(rejection)만 가로채면 된다.
 */
export function withMockFallback<T extends object>(live: T, mock: T, label: string): T {
  /** 이 시각까지만 목업을 쓰고, 지나면 다시 실서버에 물어본다. */
  let mutedUntil = 0;
  let warned = false;

  const callMock = (prop: PropertyKey, args: unknown[]): unknown => {
    const fn = (mock as Record<PropertyKey, unknown>)[prop] as (...a: unknown[]) => unknown;
    return fn.apply(mock, args);
  };

  const warnOnce = (reason: 'not-deployed' | 'unreachable') => {
    // 장부는 매번 갱신한다 — 사유가 '못 닿음'에서 '라우트 없음'으로 바뀌는 것은
    // 화면에 보여야 하는 변화다(전자는 기다리면 되고, 후자는 배포가 필요하다).
    const since = degradations.get(label)?.since ?? Date.now();
    const before = degradations.get(label);
    degradations.set(label, { label, reason, since });
    // 상태가 실제로 달라졌을 때만 깨운다 — 매 호출마다 알리면 배너가 계속 다시 그려진다.
    if (!before || before.reason !== reason) listeners.forEach((l) => l());
    if (warned) return;
    warned = true;
    // 기능 하나가 실서버 대신 목업으로 도는 것은 운영에서도 알아야 하는 상태다
    // ("왜 날씨가 늘 맑음이지?"의 답이 여기 있다). 폴백당 한 번만 남긴다.
    logger.warn('repository_degraded_to_mock', { repository: label, reason });
  };

  return new Proxy(live, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;

      return async (...args: unknown[]) => {
        if (Date.now() < mutedUntil) return callMock(prop, args);
        try {
          const result = await (value as (...a: unknown[]) => unknown).apply(target, args);
          // 되살아났다 — 장부에서 지운다. 남겨 두면 화면이 이미 끝난 장애를 계속
          // 보여주고, 그 표시를 믿지 않게 되는 순간 장부 자체가 쓸모없어진다.
          if (warned) {
            degradations.delete(label);
            warned = false;
            // 배너를 걷어야 한다 — 장부만 지우고 알리지 않으면 장애가 끝난 뒤에도
            // 화면에는 '서버에 연결되지 않았습니다'가 그대로 남는다.
            listeners.forEach((l) => l());
          }
          return result;
        } catch (e) {
          const reason = classify(e);
          if (!reason) throw e;
          // 매 호출마다 실패를 되풀이하지 않도록 잠시 목업으로 내려가되,
          // 창이 지나면 스스로 실서버를 다시 확인한다.
          mutedUntil =
            Date.now() + (reason === 'not-deployed' ? NOT_DEPLOYED_RETRY_MS : TRANSIENT_RETRY_MS);
          warnOnce(reason);
          return callMock(prop, args);
        }
      };
    },
  });
}
