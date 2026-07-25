import { isEndpointUnavailable, withMockFallback } from '../_fallback';
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
