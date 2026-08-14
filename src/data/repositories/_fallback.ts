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

// '엔드포인트가 아직 서버에 없거나 붙지 않았음'으로 볼 수 있는 상태 코드.
//  · 404 Not Found        — 라우트가 아직 배포되지 않음(부분 배포의 전형).
//  · 501 Not Implemented  — 서버가 명시적으로 미구현이라고 답함.
//  · 502/503/504          — 게이트웨이/서비스 미기동(뒤에 붙는 서비스가 아직 없음).
// ⚠️ 위 목록에서 502/503/504 와 0 을 아래 TRANSIENT 로 분리했다 — 이유는 다음 블록 참고.
const NOT_DEPLOYED_STATUS = new Set([404, 501]);

// '지금 못 닿았다'는 **일시적** 신호 — 답이 몇 초 뒤에 달라질 수 있다.
//  · 0            — ApiClient 가 정규화한 연결 없음/타임아웃.
//  · 502/503/504  — 게이트웨이 오류·서비스 재기동·과부하.
const TRANSIENT_STATUS = new Set([0, 502, 503, 504]);

/**
 * 일시적 실패로 목업에 내려간 뒤, 이 시간이 지나면 실서버를 한 번 더 확인한다.
 * (지하에서 잠깐 끊긴 것 때문에 지상으로 나온 뒤에도 계속 목업을 쓰면 안 된다.)
 */
export const TRANSIENT_RETRY_MS = 60_000;

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

/** 폴백 사유의 성격 — 다시 물어볼 가치가 있는 실패인지 가른다. */
function classify(e: unknown): 'permanent' | 'transient' | null {
  if (!(e instanceof ApiError)) return null;
  if (NOT_DEPLOYED_STATUS.has(e.status)) return 'permanent';
  if (TRANSIENT_STATUS.has(e.status)) return 'transient';
  return null;
}

/**
 * 실서버 저장소(live)를 감싸, 엔드포인트가 아직 없을 때 조용히 목업(mock)으로 위임하는
 * 프록시를 만든다.
 *
 * **실패의 성격을 구분한다** — 예전에는 '연결 없음(status 0)'까지 미배포와 똑같이 취급해
 * 한 번 걸리면 프로세스가 죽을 때까지 목업에 갇혔다. 이 앱은 지하·철골 구조물에서 쓰여
 * 순간 단절이 일상이므로, 터널을 한 번 지나는 것만으로 날씨·하루쿼터·사용자 디렉터리가
 * 그날 내내 가짜 값을 보여주고(관리자가 상한을 바꿔도 반영되지 않고) 사용자는 그 사실을
 * 알 방법이 없었다. 지금은:
 *  · 404/501(라우트 없음) → 영구 래치. 다음 배포 전까지 다시 묻지 않는다.
 *  · 0/502/503/504(못 닿음) → `TRANSIENT_RETRY_MS` 동안만 목업, 이후 자동 재확인.
 *
 * live/mock 은 같은 인터페이스 T 를 구현하므로 메서드 시그니처가 정확히 일치한다.
 * 저장소 메서드는 모두 Promise 를 반환하므로 비동기 거부(rejection)만 가로채면 된다.
 */
export function withMockFallback<T extends object>(live: T, mock: T, label: string): T {
  /** 라우트가 없다고 서버가 답했다 — 다음 배포 전까지 바뀌지 않으므로 영구 래치. */
  let notDeployed = false;
  /** 일시적으로 못 닿았다 — 이 시각까지만 목업을 쓰고, 지나면 다시 실서버에 물어본다. */
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
    degradations.set(label, { label, reason, since });
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
        if (notDeployed || Date.now() < mutedUntil) return callMock(prop, args);
        try {
          const result = await (value as (...a: unknown[]) => unknown).apply(target, args);
          // 되살아났다 — 장부에서 지운다. 남겨 두면 화면이 이미 끝난 장애를 계속
          // 보여주고, 그 표시를 믿지 않게 되는 순간 장부 자체가 쓸모없어진다.
          if (warned) {
            degradations.delete(label);
            warned = false;
          }
          return result;
        } catch (e) {
          const kind = classify(e);
          if (!kind) throw e;
          if (kind === 'permanent') {
            notDeployed = true;
            warnOnce('not-deployed');
          } else {
            // 잠깐 못 닿은 것뿐이다 — 매 호출 실패를 반복하지 않도록 잠시 목업으로
            // 내려가되, 창이 지나면 스스로 실서버를 다시 확인한다.
            mutedUntil = Date.now() + TRANSIENT_RETRY_MS;
            warnOnce('unreachable');
          }
          return callMock(prop, args);
        }
      };
    },
  });
}
