// ApiClient 단위 테스트 — RN/Expo 를 로드하지 않도록 env·secureStorage 를 모듈 경계에서
// 통째로 모킹하고 fetch 를 가짜로 심는다. 401→refresh 재시도, 토큰 회전(F1),
// 동시 401 single-flight(F2)를 검증한다.

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
import { ApiError } from '../errors';
import { secureStorage, StorageKeys } from '../../storage/secureStorage';
import { setLogSink, resetLogSink } from '../../../utils/logger';

// 실패 응답을 다수 검증하므로 구조화 로그를 흡수해 테스트 출력을 깨끗하게 유지한다.
beforeAll(() => setLogSink(() => {}));
afterAll(() => resetLogSink());

type Init = { headers?: Record<string, string> };
const resp = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

async function seedTokens(access: string, refresh: string) {
  await secureStorage.setItem(StorageKeys.accessToken, access);
  await secureStorage.setItem(StorageKeys.refreshToken, refresh);
}

beforeEach(async () => {
  // 각 테스트 초기화 — 저장소 비우기
  await secureStorage.removeItem(StorageKeys.accessToken);
  await secureStorage.removeItem(StorageKeys.refreshToken);
});

describe('요청/응답 기본', () => {
  it('GET 성공 시 Authorization 헤더를 붙이고 본문을 반환한다', async () => {
    await seedTokens('tok-1', 'r-1');
    global.fetch = jest.fn(async (_url, init?: Init) => {
      expect(init?.headers?.Authorization).toBe('Bearer tok-1');
      return resp(200, { hello: 'world' });
    }) as unknown as typeof fetch;

    await expect(apiClient.get('/api/thing')).resolves.toEqual({ hello: 'world' });
  });

  it('non-401 에러는 상태·메시지를 담은 ApiError 로 정규화한다', async () => {
    global.fetch = jest.fn(async () => resp(400, { message: '잘못된 요청' })) as unknown as typeof fetch;
    await expect(apiClient.get('/api/thing')).rejects.toMatchObject({ status: 400, message: '잘못된 요청' });
  });

  it('네트워크 단절은 status 0 ApiError 로 정규화한다', async () => {
    global.fetch = jest.fn(async () => { throw new TypeError('Network request failed'); }) as unknown as typeof fetch;
    await expect(apiClient.get('/api/thing')).rejects.toMatchObject({ status: 0 });
  });
});

describe('401 → refresh 재시도', () => {
  it('만료된 토큰이면 refresh 후 재요청이 성공한다', async () => {
    await seedTokens('expired', 'r-1');
    global.fetch = jest.fn(async (url, init?: Init) => {
      const u = String(url);
      if (u.endsWith('/api/auth/refresh')) return resp(200, { access_token: 'fresh', refresh_token: 'r-2' });
      // 새 토큰(Bearer fresh)일 때만 통과
      return init?.headers?.Authorization === 'Bearer fresh' ? resp(200, { ok: true }) : resp(401, {});
    }) as unknown as typeof fetch;

    await expect(apiClient.get('/api/protected')).resolves.toEqual({ ok: true });
  });

  it('[F1] refresh 응답의 회전된 refresh_token 을 저장한다', async () => {
    await seedTokens('expired', 'r-1');
    global.fetch = jest.fn(async (url, init?: Init) => {
      const u = String(url);
      if (u.endsWith('/api/auth/refresh')) return resp(200, { access_token: 'fresh', refresh_token: 'r-2' });
      return init?.headers?.Authorization === 'Bearer fresh' ? resp(200, { ok: true }) : resp(401, {});
    }) as unknown as typeof fetch;

    await apiClient.get('/api/protected');
    expect(await secureStorage.getItem(StorageKeys.accessToken)).toBe('fresh');
    expect(await secureStorage.getItem(StorageKeys.refreshToken)).toBe('r-2'); // 회전 반영
  });

  it('[F1] refresh 응답에 access_token 이 없으면 성공으로 오인하지 않고 로그아웃한다', async () => {
    await seedTokens('expired', 'r-1');
    global.fetch = jest.fn(async (url) => {
      const u = String(url);
      if (u.endsWith('/api/auth/refresh')) return resp(200, {}); // 빈 응답
      return resp(401, {});
    }) as unknown as typeof fetch;

    await expect(apiClient.get('/api/protected')).rejects.toMatchObject({ status: 401 });
    // 토큰이 정리되어야 한다(undefined 저장 금지)
    expect(await secureStorage.getItem(StorageKeys.accessToken)).toBeNull();
    expect(await secureStorage.getItem(StorageKeys.refreshToken)).toBeNull();
  });

  it('refresh 토큰이 없으면 즉시 로그아웃(refresh 시도 없음)', async () => {
    await secureStorage.setItem(StorageKeys.accessToken, 'expired'); // refresh 없음
    const fetchMock = jest.fn(async (_url: string) => resp(401, {}));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(apiClient.get('/api/protected')).rejects.toMatchObject({ status: 401 });
    // refresh 엔드포인트는 호출되지 않아야 한다
    const calledRefresh = fetchMock.mock.calls.some(([u]) => String(u).endsWith('/api/auth/refresh'));
    expect(calledRefresh).toBe(false);
  });

  it('[F2] 동시 401 요청이 여러 개여도 refresh 는 한 번만 호출한다 (single-flight)', async () => {
    await seedTokens('expired', 'r-1');
    let refreshCalls = 0;
    global.fetch = jest.fn(async (url, init?: Init) => {
      const u = String(url);
      if (u.endsWith('/api/auth/refresh')) {
        refreshCalls++;
        // 회전: 두 번째 이후 호출은 실패해야 정상(토큰 무효화) — single-flight 라면 애초에 1회
        return resp(200, { access_token: 'fresh', refresh_token: 'r-2' });
      }
      return init?.headers?.Authorization === 'Bearer fresh' ? resp(200, { ok: true }) : resp(401, {});
    }) as unknown as typeof fetch;

    const results = await Promise.all([
      apiClient.get('/api/a'),
      apiClient.get('/api/b'),
      apiClient.get('/api/c'),
    ]);
    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(refreshCalls).toBe(1); // 쇄도(stampede) 방지
  });
});
