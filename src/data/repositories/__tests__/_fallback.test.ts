import {
  isEndpointUnavailable,
  withMockFallback,
  listDegradations,
  __resetDegradationsForTests,
  TRANSIENT_RETRY_MS,
} from '../_fallback';
import { ApiError } from '../../network/errors';

(globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;

describe('isEndpointUnavailable', () => {
  it.each([0, 404, 501, 502, 503, 504])('상태 %p 는 "미배포"로 본다', (status) => {
    expect(isEndpointUnavailable(new ApiError(status, 'x'))).toBe(true);
  });

  it.each([400, 401, 403, 409, 500])('상태 %p 는 미배포가 아니다', (status) => {
    expect(isEndpointUnavailable(new ApiError(status, 'x'))).toBe(false);
  });

  it('ApiError 가 아닌 값은 false', () => {
    expect(isEndpointUnavailable(new Error('boom'))).toBe(false);
    expect(isEndpointUnavailable(null)).toBe(false);
  });
});

interface Svc {
  ping(): Promise<string>;
}

describe('withMockFallback', () => {
  it('live 가 정상이면 live 결과를 반환한다', async () => {
    const live: Svc = { ping: async () => 'live' };
    const mock: Svc = { ping: async () => 'mock' };
    const proxied = withMockFallback(live, mock, 'test');
    expect(await proxied.ping()).toBe('live');
  });

  it('live 가 "미배포" 에러를 던지면 조용히 mock 으로 폴백한다', async () => {
    const live: Svc = { ping: async () => { throw new ApiError(404, 'not deployed'); } };
    const mock: Svc = { ping: async () => 'mock' };
    const proxied = withMockFallback(live, mock, 'test');
    expect(await proxied.ping()).toBe('mock');
  });

  it('한 번 미배포로 판단되면 이후엔 live 를 호출하지 않고 곧바로 mock 을 쓴다 (degrade-once)', async () => {
    let liveCalls = 0;
    const live: Svc = { ping: async () => { liveCalls++; throw new ApiError(503, 'down'); } };
    const mock: Svc = { ping: async () => 'mock' };
    const proxied = withMockFallback(live, mock, 'test');
    await proxied.ping();
    await proxied.ping();
    await proxied.ping();
    expect(liveCalls).toBe(1); // 첫 호출만 live 시도, 이후는 mock 직행
  });

  it('"미배포"가 아닌 진짜 에러(500 등)는 삼키지 않고 그대로 던진다', async () => {
    const live: Svc = { ping: async () => { throw new ApiError(500, 'server error'); } };
    const mock: Svc = { ping: async () => 'mock' };
    const proxied = withMockFallback(live, mock, 'test');
    await expect(proxied.ping()).rejects.toThrow(ApiError);
  });
});

describe('withMockFallback — 일시적 단절과 영구 미배포의 구분', () => {
  afterEach(() => jest.useRealTimers());

  it('404(라우트 없음)는 영구 래치 — 다시 실서버에 묻지 않는다', async () => {
    jest.useFakeTimers();
    let liveCalls = 0;
    const live: Svc = { ping: async () => { liveCalls++; throw new ApiError(404, 'no route'); } };
    const mock: Svc = { ping: async () => 'mock' };
    const proxied = withMockFallback(live, mock, 'test');

    await proxied.ping();
    jest.advanceTimersByTime(TRANSIENT_RETRY_MS * 10);
    await proxied.ping();
    expect(liveCalls).toBe(1);
  });

  it('연결 없음(status 0)은 재확인 창이 지나면 실서버를 다시 시도한다', async () => {
    jest.useFakeTimers();
    let liveCalls = 0;
    const live: Svc = {
      ping: async () => {
        liveCalls++;
        if (liveCalls === 1) throw new ApiError(0, '연결 없음');
        return 'live';
      },
    };
    const mock: Svc = { ping: async () => 'mock' };
    const proxied = withMockFallback(live, mock, 'test');

    // 지하에서 한 번 끊겼다 → 이번 호출과 그 직후는 목업.
    expect(await proxied.ping()).toBe('mock');
    expect(await proxied.ping()).toBe('mock');
    expect(liveCalls).toBe(1);

    // 지상으로 나왔다 → 창이 지나면 스스로 실서버를 다시 확인해야 한다.
    // (이 재확인이 없으면 터널 한 번에 앱을 끌 때까지 가짜 데이터를 본다.)
    jest.advanceTimersByTime(TRANSIENT_RETRY_MS + 1);
    expect(await proxied.ping()).toBe('live');
    expect(liveCalls).toBe(2);
  });

  it('503(일시 오류)도 재확인 대상이다', async () => {
    jest.useFakeTimers();
    let liveCalls = 0;
    const live: Svc = {
      ping: async () => {
        liveCalls++;
        if (liveCalls === 1) throw new ApiError(503, 'restarting');
        return 'live';
      },
    };
    const proxied = withMockFallback(live, { ping: async () => 'mock' }, 'test');

    expect(await proxied.ping()).toBe('mock');
    jest.advanceTimersByTime(TRANSIENT_RETRY_MS + 1);
    expect(await proxied.ping()).toBe('live');
  });
});

// 강등 장부 — 조용한 폴백을 눈에 보이게 하는 장치.
//
// 폴백 자체는 화면을 살리지만, 그 사실을 아무도 모르면 "왜 내가 올린 질문이
// 다른 기기에서 안 보이지?"의 답을 사용자도 운영자도 찾을 수 없다.
// 개발자 화면의 '기능별 연결 상태'가 이 장부를 그대로 그린다.
describe('강등 장부(listDegradations)', () => {
  beforeEach(() => {
    __resetDegradationsForTests();
    jest.useRealTimers();
  });

  it('처음에는 비어 있다(호출되지 않은 기능은 나타나지 않는다)', () => {
    expect(listDegradations()).toEqual([]);
  });

  it('라우트가 없어 목업으로 떨어지면 사유와 함께 남는다', async () => {
    const live: Svc = { ping: async () => { throw new ApiError(404, 'no route'); } };
    const proxied = withMockFallback(live, { ping: async () => 'mock' }, 'qna');
    await proxied.ping();

    const [entry] = listDegradations();
    expect(entry.label).toBe('qna');
    expect(entry.reason).toBe('not-deployed');
  });

  it('못 닿은 것과 라우트가 없는 것을 구분한다', async () => {
    const live: Svc = { ping: async () => { throw new ApiError(0, '연결 없음'); } };
    const proxied = withMockFallback(live, { ping: async () => 'mock' }, 'settings');
    await proxied.ping();
    expect(listDegradations()[0].reason).toBe('unreachable');
  });

  it('실서버가 되살아나면 장부에서 지운다(끝난 장애를 계속 보여주지 않는다)', async () => {
    jest.useFakeTimers();
    let calls = 0;
    const live: Svc = {
      ping: async () => {
        calls++;
        if (calls === 1) throw new ApiError(503, 'restarting');
        return 'live';
      },
    };
    const proxied = withMockFallback(live, { ping: async () => 'mock' }, 'weather');

    await proxied.ping();
    expect(listDegradations()).toHaveLength(1);

    jest.advanceTimersByTime(TRANSIENT_RETRY_MS + 1);
    expect(await proxied.ping()).toBe('live');
    expect(listDegradations()).toEqual([]);
  });
});
