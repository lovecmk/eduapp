// 회복력(재시도·오프라인 큐) 통합 테스트 — AsyncStorage 를 쓰므로 components 프로젝트에서 돌린다.
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
import { pendingCount, clearQueue } from '../offlineQueue';
import { setLogSink, resetLogSink } from '../../../utils/logger';

beforeAll(() => setLogSink(() => {}));
afterAll(() => resetLogSink());
beforeEach(async () => { await clearQueue(); });

// 실제 fetch Response 와 같은 모양(json + text)을 갖춘다 — ApiClient 는 빈 본문(204)을
// 성공으로 다루기 위해 text() 로 읽는다.
const ok = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
});
const fail = (status: number, body: unknown = {}) => ({
  ok: false,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

describe('GET 재시도', () => {
  it('일시적 실패(503) 후 성공하면 결과를 돌려준다', async () => {
    let calls = 0;
    global.fetch = jest.fn(async () => {
      calls += 1;
      return calls < 2 ? fail(503) : ok({ v: 1 });
    }) as unknown as typeof fetch;

    await expect(apiClient.get('/api/thing')).resolves.toEqual({ v: 1 });
    expect(calls).toBe(2);
  });

  it('네트워크 단절도 재시도한다', async () => {
    let calls = 0;
    global.fetch = jest.fn(async () => {
      calls += 1;
      if (calls < 3) throw new TypeError('Network request failed');
      return ok({ v: 2 });
    }) as unknown as typeof fetch;

    await expect(apiClient.get('/api/thing')).resolves.toEqual({ v: 2 });
    expect(calls).toBe(3);
  });

  it('입력 오류(400)는 재시도하지 않고 즉시 던진다', async () => {
    let calls = 0;
    global.fetch = jest.fn(async () => { calls += 1; return fail(400, { message: '잘못됨' }); }) as unknown as typeof fetch;

    await expect(apiClient.get('/api/thing')).rejects.toMatchObject({ status: 400 });
    expect(calls).toBe(1); // 재시도 없음
  });

  it('계속 실패하면 마지막 오류를 던진다(무한 재시도 없음)', async () => {
    const fetchMock = jest.fn(async () => fail(500));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(apiClient.get('/api/thing')).rejects.toMatchObject({ status: 500 });
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(3); // 최초 1 + 재시도 2
  });
});

describe('postDurable — 유실 없는 쓰기', () => {
  it('성공하면 sent 를 반환하고 큐에 남기지 않는다', async () => {
    global.fetch = jest.fn(async () => ok({})) as unknown as typeof fetch;
    await expect(apiClient.postDurable('/api/progress/attendance', { day: 'd' })).resolves.toBe('sent');
    expect(await pendingCount()).toBe(0);
  });

  it('멱등키를 Idempotency-Key 헤더로 보낸다(서버 중복 반영 방지)', async () => {
    const seen: Record<string, string>[] = [];
    global.fetch = jest.fn(async (_u, init?: { headers?: Record<string, string> }) => {
      if (init?.headers) seen.push(init.headers);
      return ok({});
    }) as unknown as typeof fetch;

    await apiClient.postDurable('/api/reports', { card_id: 'c1' }, 'report:c1:typo');
    expect(seen.some((h) => h['Idempotency-Key'] === 'report:c1:typo')).toBe(true);
  });

  it('오프라인이면 큐에 넣고 queued 를 반환한다(사용자 행동 보존)', async () => {
    global.fetch = jest.fn(async () => { throw new TypeError('Network request failed'); }) as unknown as typeof fetch;

    await expect(apiClient.postDurable('/api/progress/grade', { card_id: 'c1' })).resolves.toBe('queued');
    expect(await pendingCount()).toBe(1);
  });

  it('서버 오류(500)도 큐에 넣는다', async () => {
    global.fetch = jest.fn(async () => fail(500)) as unknown as typeof fetch;
    await expect(apiClient.postDurable('/api/reports', {})).resolves.toBe('queued');
    expect(await pendingCount()).toBe(1);
  });

  it('입력 오류(400)는 큐에 넣지 않고 던진다(다시 보내도 실패하므로)', async () => {
    global.fetch = jest.fn(async () => fail(400, { message: '사유를 선택해주세요' })) as unknown as typeof fetch;

    await expect(apiClient.postDurable('/api/reports', {})).rejects.toMatchObject({ status: 400 });
    expect(await pendingCount()).toBe(0);
  });

  it('네트워크 복구 후 flush 하면 밀린 쓰기가 전송된다', async () => {
    // 1) 오프라인 상태에서 두 건 쌓기
    global.fetch = jest.fn(async () => { throw new TypeError('offline'); }) as unknown as typeof fetch;
    await apiClient.postDurable('/api/a', { n: 1 });
    await apiClient.postDurable('/api/b', { n: 2 });
    expect(await pendingCount()).toBe(2);

    // 2) 복구 후 flush
    const paths: string[] = [];
    global.fetch = jest.fn(async (u) => { paths.push(String(u)); return ok({}); }) as unknown as typeof fetch;
    expect(await apiClient.flushPendingWrites()).toBe(2);
    expect(await pendingCount()).toBe(0);
    expect(paths.some((p) => p.endsWith('/api/a'))).toBe(true);
    expect(paths.some((p) => p.endsWith('/api/b'))).toBe(true);
  });
});
