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
import { onSessionExpired } from '../sessionEvents';
import { ApiError } from '../errors';
import { secureStorage, StorageKeys } from '../../storage/secureStorage';
import { setLogSink, resetLogSink } from '../../../utils/logger';

// 실패 응답을 다수 검증하므로 구조화 로그를 흡수해 테스트 출력을 깨끗하게 유지한다.
beforeAll(() => setLogSink(() => {}));
afterAll(() => resetLogSink());

type Init = { headers?: Record<string, string> };
// 실제 fetch Response 는 json() 과 text() 를 모두 제공한다.
// ApiClient 는 빈 본문(204 등)을 구분하려고 text() 로 읽으므로 목업도 같은 모양이어야 한다.
const resp = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => (body === undefined ? '' : JSON.stringify(body)),
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

    await expect(apiClient.get('/inner/api/v1/thing')).resolves.toEqual({ hello: 'world' });
  });

  it('non-401 에러는 상태·메시지를 담은 ApiError 로 정규화한다', async () => {
    global.fetch = jest.fn(async () => resp(400, { message: '잘못된 요청' })) as unknown as typeof fetch;
    await expect(apiClient.get('/inner/api/v1/thing')).rejects.toMatchObject({ status: 400, message: '잘못된 요청' });
  });

  it('네트워크 단절은 status 0 ApiError 로 정규화한다', async () => {
    global.fetch = jest.fn(async () => { throw new TypeError('Network request failed'); }) as unknown as typeof fetch;
    await expect(apiClient.get('/inner/api/v1/thing')).rejects.toMatchObject({ status: 0 });
  });
});

describe('401 → refresh 재시도', () => {
  it('만료된 토큰이면 refresh 후 재요청이 성공한다', async () => {
    await seedTokens('expired', 'r-1');
    global.fetch = jest.fn(async (url, init?: Init) => {
      const u = String(url);
      if (u.endsWith('/inner/api/v1/auth/refresh')) return resp(200, { access_token: 'fresh', refresh_token: 'r-2' });
      // 새 토큰(Bearer fresh)일 때만 통과
      return init?.headers?.Authorization === 'Bearer fresh' ? resp(200, { ok: true }) : resp(401, {});
    }) as unknown as typeof fetch;

    await expect(apiClient.get('/inner/api/v1/protected')).resolves.toEqual({ ok: true });
  });

  it('[F1] refresh 응답의 회전된 refresh_token 을 저장한다', async () => {
    await seedTokens('expired', 'r-1');
    global.fetch = jest.fn(async (url, init?: Init) => {
      const u = String(url);
      if (u.endsWith('/inner/api/v1/auth/refresh')) return resp(200, { access_token: 'fresh', refresh_token: 'r-2' });
      return init?.headers?.Authorization === 'Bearer fresh' ? resp(200, { ok: true }) : resp(401, {});
    }) as unknown as typeof fetch;

    await apiClient.get('/inner/api/v1/protected');
    expect(await secureStorage.getItem(StorageKeys.accessToken)).toBe('fresh');
    expect(await secureStorage.getItem(StorageKeys.refreshToken)).toBe('r-2'); // 회전 반영
  });

  it('[F1] refresh 응답에 access_token 이 없으면 성공으로 오인하지 않고 로그아웃한다', async () => {
    await seedTokens('expired', 'r-1');
    global.fetch = jest.fn(async (url) => {
      const u = String(url);
      if (u.endsWith('/inner/api/v1/auth/refresh')) return resp(200, {}); // 빈 응답
      return resp(401, {});
    }) as unknown as typeof fetch;

    await expect(apiClient.get('/inner/api/v1/protected')).rejects.toMatchObject({ status: 401 });
    // 토큰이 정리되어야 한다(undefined 저장 금지)
    expect(await secureStorage.getItem(StorageKeys.accessToken)).toBeNull();
    expect(await secureStorage.getItem(StorageKeys.refreshToken)).toBeNull();
  });

  it('refresh 토큰이 없으면 즉시 로그아웃(refresh 시도 없음)', async () => {
    await secureStorage.setItem(StorageKeys.accessToken, 'expired'); // refresh 없음
    const fetchMock = jest.fn(async (_url: string) => resp(401, {}));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(apiClient.get('/inner/api/v1/protected')).rejects.toMatchObject({ status: 401 });
    // refresh 엔드포인트는 호출되지 않아야 한다
    const calledRefresh = fetchMock.mock.calls.some(([u]) => String(u).endsWith('/inner/api/v1/auth/refresh'));
    expect(calledRefresh).toBe(false);
  });

  it('[F2] 동시 401 요청이 여러 개여도 refresh 는 한 번만 호출한다 (single-flight)', async () => {
    await seedTokens('expired', 'r-1');
    let refreshCalls = 0;
    global.fetch = jest.fn(async (url, init?: Init) => {
      const u = String(url);
      if (u.endsWith('/inner/api/v1/auth/refresh')) {
        refreshCalls++;
        // 회전: 두 번째 이후 호출은 실패해야 정상(토큰 무효화) — single-flight 라면 애초에 1회
        return resp(200, { access_token: 'fresh', refresh_token: 'r-2' });
      }
      return init?.headers?.Authorization === 'Bearer fresh' ? resp(200, { ok: true }) : resp(401, {});
    }) as unknown as typeof fetch;

    const results = await Promise.all([
      apiClient.get('/inner/api/v1/a'),
      apiClient.get('/inner/api/v1/b'),
      apiClient.get('/inner/api/v1/c'),
    ]);
    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(refreshCalls).toBe(1); // 쇄도(stampede) 방지
  });
});

describe('본문 없는 성공 응답', () => {
  // 삭제(DELETE)는 204 No Content 로, 일부 쓰기는 빈 200 으로 답한다.
  // 이런 응답에 res.json() 을 걸면 SyntaxError 가 나면서 성공한 요청이 실패로 둔갑한다.
  const emptyResp = (status: number) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => { throw new SyntaxError('Unexpected end of JSON input'); },
    text: async () => '',
  });

  it('204 No Content 를 성공으로 다룬다', async () => {
    global.fetch = jest.fn(async () => emptyResp(204)) as unknown as typeof fetch;
    await expect(apiClient.delete('/inner/api/v1/admin/cards/c1')).resolves.toEqual({});
  });

  it('본문이 빈 200 도 성공으로 다룬다', async () => {
    global.fetch = jest.fn(async () => emptyResp(200)) as unknown as typeof fetch;
    await expect(apiClient.post('/inner/api/v1/auth/logout', {})).resolves.toEqual({});
  });

  it('JSON 이 아닌 본문(프록시 HTML 오류 페이지)은 형식 오류로 알린다', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('bad'); },
      text: async () => '<html>502 Bad Gateway</html>',
    })) as unknown as typeof fetch;
    // 원시 SyntaxError 가 아니라 화면이 다룰 수 있는 ApiError 로 정규화되어야 한다.
    await expect(apiClient.get('/inner/api/v1/thing', { retries: 0 })).rejects.toBeInstanceOf(ApiError);
  });

  it('retries:0 이면 일시적 실패에도 다시 시도하지 않는다(부팅 경로용)', async () => {
    const fetchMock = jest.fn(async () => resp(503, {}));
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(apiClient.get('/inner/api/v1/auth/me', { retries: 0 })).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('토큰 갱신 경합 — 연달아 도착한 401', () => {
  it('내가 보낸 사이 다른 요청이 이미 갱신했으면 refresh 를 다시 돌리지 않는다', async () => {
    await seedTokens('tok-old', 'r-1');
    let refreshCalls = 0;
    global.fetch = jest.fn(async (url: string, init?: Init & { method?: string }) => {
      if (String(url).endsWith('/inner/api/v1/auth/refresh')) {
        refreshCalls += 1;
        return resp(200, { access_token: 'tok-new', refresh_token: 'r-2' });
      }
      // 첫 요청은 낡은 토큰이라 401, 새 토큰이면 통과.
      if (init?.headers?.Authorization === 'Bearer tok-new') return resp(200, { ok: true });
      // 401 을 돌려주기 직전에, 다른 흐름이 이미 갱신을 끝낸 상황을 만든다.
      await secureStorage.setItem(StorageKeys.accessToken, 'tok-new');
      return resp(401, {});
    }) as unknown as typeof fetch;

    await expect(apiClient.get('/inner/api/v1/thing', { retries: 0 })).resolves.toEqual({ ok: true });
    // 이미 새 토큰이 있으므로 refresh 는 한 번도 나가면 안 된다.
    // (돌았다면 회전된 refresh 토큰이 거부되고 clearTokens 가 새 토큰을 지운다.)
    expect(refreshCalls).toBe(0);
    expect(await secureStorage.getItem(StorageKeys.accessToken)).toBe('tok-new');
  });

  it('refresh 가 실패해도 그 사이 남이 갱신해 두었다면 토큰을 지우지 않는다', async () => {
    await seedTokens('tok-old', 'r-1');
    global.fetch = jest.fn(async (url: string, init?: Init & { method?: string }) => {
      if (String(url).endsWith('/inner/api/v1/auth/refresh')) {
        // 내 refresh 는 실패하지만, 그 사이 다른 흐름이 갱신에 성공한 상태를 만든다.
        await secureStorage.setItem(StorageKeys.accessToken, 'tok-new');
        return resp(401, {});
      }
      if (init?.headers?.Authorization === 'Bearer tok-new') return resp(200, { ok: true });
      return resp(401, {});
    }) as unknown as typeof fetch;

    await expect(apiClient.get('/inner/api/v1/thing', { retries: 0 })).resolves.toEqual({ ok: true });
    expect(await secureStorage.getItem(StorageKeys.accessToken)).toBe('tok-new');
    expect(await secureStorage.getItem(StorageKeys.refreshToken)).toBe('r-1');
  });
});

describe('본문 읽기 중단', () => {
  it('헤더만 오고 본문에서 끊긴 응답을 offline(재시도 가능)으로 정규화한다', async () => {
    await seedTokens('tok-1', 'r-1');
    // 헤더는 200 으로 왔지만 본문 스트림이 끊긴다(프록시가 흘리다 만 경우).
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        throw err;
      },
    })) as unknown as typeof fetch;

    const err: unknown = await apiClient.get('/inner/api/v1/thing', { retries: 0 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    // 여기서 kind 가 'unknown' 이면 retryable=false 가 되어
    // 오프라인 큐가 사용자의 출석·채점 기록을 버린다.
    expect((err as ApiError).kind).toBe('offline');
    expect((err as ApiError).retryable).toBe(true);
  });
});

// 세션 만료 신호 — 예전에는 토큰만 지우고 화면의 로그인 상태는 남겨 두어,
// 쓰는 도중 세션이 끊긴 사람은 로그인된 화면에서 오류만 받았다.
describe('세션 만료 신호(sessionEvents)', () => {
  it('토큰을 실어 보낸 요청이 refresh 까지 실패하면 만료를 알린다', async () => {
    const heard = jest.fn();
    const off = onSessionExpired(heard);
    await seedTokens('old', 'r-dead');
    global.fetch = jest.fn(async () => resp(401, { message: 'expired' })) as unknown as typeof fetch;

    await expect(apiClient.get('/inner/api/v1/thing', { retries: 0 })).rejects.toMatchObject({ status: 401 });
    expect(heard).toHaveBeenCalledTimes(1);
    off();
  });

  it('토큰 없이 나간 요청의 401(틀린 비밀번호 등)은 세션 만료가 아니다', async () => {
    const heard = jest.fn();
    const off = onSessionExpired(heard);
    global.fetch = jest.fn(async () => resp(401, { message: '아이디 또는 비밀번호가 올바르지 않습니다' })) as unknown as typeof fetch;

    await expect(apiClient.post('/inner/api/v1/auth/login', { id: 'a', password: 'b' })).rejects.toMatchObject({ status: 401 });
    expect(heard).not.toHaveBeenCalled();
    off();
  });
});
