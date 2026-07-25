// 헬스체크 단위 테스트 — 실패해도 예외를 던지지 않고 ok:false 로 표현하는지 검증한다.

jest.mock('../env', () => ({
  env: { apiBaseUrl: 'https://api.test', apiTimeoutMs: 5000 },
}));

jest.mock('../../storage/secureStorage', () => {
  const store = new Map<string, string>();
  return {
    StorageKeys: { accessToken: 'accessToken', refreshToken: 'refreshToken' },
    secureStorage: {
      getItem: (k: string) => Promise.resolve(store.get(k) ?? null),
      setItem: (k: string, v: string) => { store.set(k, v); return Promise.resolve(); },
      removeItem: (k: string) => { store.delete(k); return Promise.resolve(); },
    },
  };
});

import { apiClient } from '../ApiClient';
import { setLogSink, resetLogSink } from '../../../utils/logger';

// 실패 경로를 의도적으로 테스트하므로, 구조화 로그가 콘솔을 더럽히지 않게 흡수한다.
beforeAll(() => setLogSink(() => {}));
afterAll(() => resetLogSink());

const resp = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe('apiClient.health', () => {
  it('status:ok 응답이면 ok=true 와 version 을 반환한다', async () => {
    global.fetch = jest.fn(async () => resp(200, { status: 'ok', version: '1.2.3' })) as unknown as typeof fetch;
    const r = await apiClient.health();
    expect(r.ok).toBe(true);
    expect(r.version).toBe('1.2.3');
    expect(typeof r.latencyMs).toBe('number');
  });

  it('status 가 ok 가 아니면 ok=false', async () => {
    global.fetch = jest.fn(async () => resp(200, { status: 'degraded' })) as unknown as typeof fetch;
    expect((await apiClient.health()).ok).toBe(false);
  });

  it('서버 5xx 여도 예외를 던지지 않고 ok=false + error 메시지', async () => {
    global.fetch = jest.fn(async () => resp(500, { message: '서버 오류' })) as unknown as typeof fetch;
    const r = await apiClient.health();
    expect(r.ok).toBe(false);
    expect(r.error).toContain('500');
  });

  it('네트워크 단절도 예외 없이 ok=false', async () => {
    global.fetch = jest.fn(async () => { throw new TypeError('Network request failed'); }) as unknown as typeof fetch;
    const r = await apiClient.health();
    expect(r.ok).toBe(false);
    expect(r.error).toBeDefined();
  });

  it('/api/health 경로를 호출한다', async () => {
    const fetchMock = jest.fn(async (_url: string) => resp(200, { status: 'ok' }));
    global.fetch = fetchMock as unknown as typeof fetch;
    await apiClient.health();
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.test/api/health');
  });
});
