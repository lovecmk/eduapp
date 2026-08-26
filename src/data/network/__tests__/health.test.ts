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

// 실제 fetch Response 와 같은 모양(json + text)을 갖춘다 — ApiClient 는 빈 본문을
// 구분하기 위해 text() 로 읽는다.
const resp = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => (body === undefined ? '' : JSON.stringify(body)),
});

describe('apiClient.health', () => {
  it('degraded 응답의 사유를 버리지 않는다 — 서버가 알려준 답이다', async () => {
    // 실제로 받은 응답 그대로. 200 이라 예외가 나지 않으므로, 여기서 사유를 옮겨
    // 두지 않으면 개발자 화면에는 '실패 · 알 수 없음' 만 남는다.
    global.fetch = jest.fn(async () =>
      resp(200, {
        status: 'degraded',
        reason: 'configuration unavailable',
        store: 'postgres',
        version: 'dev',
        uptime_seconds: 18493,
      }),
    ) as unknown as typeof fetch;

    const r = await apiClient.health();
    expect(r.ok).toBe(false);
    expect(r.status).toBe('degraded');
    expect(r.reason).toBe('configuration unavailable');
    // 사람이 읽는 줄에도 둘 다 담긴다.
    expect(r.error).toContain('degraded');
    expect(r.error).toContain('configuration unavailable');
    // 아파도 어느 빌드가 떠 있는지는 알아야 한다.
    expect(r.version).toBe('dev');
  });

  it('닿지 못한 경우와 구분된다 — status 가 비어 있으면 응답 자체가 없던 것', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const r = await apiClient.health();
    expect(r.ok).toBe(false);
    expect(r.status).toBeUndefined();
    expect(r.reason).toBeUndefined();
  });

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

  it('/inner/api/v1/health 경로를 호출한다', async () => {
    const fetchMock = jest.fn(async (_url: string) => resp(200, { status: 'ok' }));
    global.fetch = fetchMock as unknown as typeof fetch;
    await apiClient.health();
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.test/inner/api/v1/health');
  });
});
