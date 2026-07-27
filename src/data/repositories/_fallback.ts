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
const NOT_DEPLOYED_STATUS = new Set([404, 501, 502, 503, 504]);

/**
 * 이 실패를 '엔드포인트 미배포'로 보고 목업 폴백해도 되는지 판단.
 * status 0 은 ApiClient 가 네트워크 단절/타임아웃을 정규화한 값 — 부분 배포 중
 * 특정 서비스에 닿지 못하는 경우도 포함되므로 보조 기능 한정으로 폴백을 허용한다.
 */
export function isEndpointUnavailable(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 0 || NOT_DEPLOYED_STATUS.has(e.status));
}

/**
 * 실서버 저장소(live)를 감싸, 엔드포인트가 아직 없을 때 조용히 목업(mock)으로 위임하는
 * 프록시를 만든다. 한 번 '미배포'로 판단되면 이후 호출은 곧바로 목업으로 보내 불필요한
 * 실패 요청과 로그 소음을 없앤다(엔드포인트가 배포되면 앱 재시작 시 다시 실서버로 시도).
 *
 * live/mock 은 같은 인터페이스 T 를 구현하므로 메서드 시그니처가 정확히 일치한다.
 * 저장소 메서드는 모두 Promise 를 반환하므로 비동기 거부(rejection)만 가로채면 된다.
 */
export function withMockFallback<T extends object>(live: T, mock: T, label: string): T {
  let liveUnavailable = false;

  const callMock = (prop: PropertyKey, args: unknown[]): unknown => {
    const fn = (mock as Record<PropertyKey, unknown>)[prop] as (...a: unknown[]) => unknown;
    return fn.apply(mock, args);
  };

  const degradeOnce = (label: string) => {
    if (liveUnavailable) return;
    liveUnavailable = true;
    // 기능 하나가 실서버 대신 목업으로 도는 것은 운영에서도 알아야 하는 상태다
    // ("왜 날씨가 늘 맑음이지?"의 답이 여기 있다). 폴백당 한 번만 남긴다.
    logger.warn('repository_degraded_to_mock', { repository: label });
  };

  return new Proxy(live, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;

      return async (...args: unknown[]) => {
        if (liveUnavailable) return callMock(prop, args);
        try {
          return await (value as (...a: unknown[]) => unknown).apply(target, args);
        } catch (e) {
          if (isEndpointUnavailable(e)) {
            degradeOnce(label);
            return callMock(prop, args);
          }
          throw e;
        }
      };
    },
  });
}
