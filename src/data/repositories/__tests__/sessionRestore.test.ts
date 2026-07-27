// 앱 부팅 시 세션 복구(AuthRepository.restore) 규칙.
//
// 이 앱은 지하·철골 구조물 안에서 쓰여 연결이 없는 채로 켜지는 일이 흔하다.
// "서버에 닿지 못했다"와 "서버가 너를 거절했다"를 구분하지 못하면,
// 토큰이 멀쩡한 사용자가 오프라인일 때마다 로그인 화면으로 튕긴다.

// 타임아웃 경로를 실제로 태우는 테스트가 있어 짧게 잡는다.
jest.mock('../../network/env', () => ({
  env: { apiBaseUrl: 'https://api.test', apiTimeoutMs: 120 },
}));

jest.mock('../../storage/secureStorage', () => {
  const store = new Map<string, string>();
  return {
    StorageKeys: {
      accessToken: 'accessToken',
      refreshToken: 'refreshToken',
      mockUser: 'mockUser',
      cachedUser: 'cachedUser',
    },
    secureStorage: {
      getItem: (k: string) => Promise.resolve(store.get(k) ?? null),
      setItem: (k: string, v: string) => { store.set(k, v); return Promise.resolve(); },
      removeItem: (k: string) => { store.delete(k); return Promise.resolve(); },
    },
    __store: store,
  };
});

import { AuthRepository } from '../AuthRepository';
import { ApiError } from '../../network/errors';
import { secureStorage, StorageKeys } from '../../storage/secureStorage';
import { setLogSink, resetLogSink } from '../../../utils/logger';

beforeAll(() => setLogSink(() => {}));
afterAll(() => resetLogSink());

const USER_DTO = {
  id: 'u-1',
  login_id: 'demo',
  user_nm: '원진섭',
  nickname: '불끄는진섭',
  email_addr: 'won@example.com',
  org_nm: '안전관리본부',
  membership_cd: 'PREMIUM' as const,
  created_at: '2025-01-01T00:00:00.000Z',
  status_cd: 'A',
};

const jsonResp = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

/** 로그인해 토큰 + 프로필 캐시를 심어 둔 상태를 만든다. */
async function signIn(repo: AuthRepository) {
  global.fetch = jest.fn(async () =>
    jsonResp(200, { access_token: 'a-1', refresh_token: 'r-1', user: USER_DTO }),
  ) as unknown as typeof fetch;
  await repo.login('demo', 'demo1234');
}

beforeEach(async () => {
  await secureStorage.removeItem(StorageKeys.accessToken);
  await secureStorage.removeItem(StorageKeys.refreshToken);
  await secureStorage.removeItem(StorageKeys.cachedUser);
});

describe('AuthRepository.restore', () => {
  it('토큰이 없으면 서버를 부르지 않고 로그아웃 상태를 반환한다', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(new AuthRepository().restore()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('서버가 응답하면 최신 프로필로 복구한다', async () => {
    const repo = new AuthRepository();
    await signIn(repo);
    global.fetch = jest.fn(async () => jsonResp(200, { ...USER_DTO, user_nm: '바뀐이름' })) as unknown as typeof fetch;
    const user = await repo.restore();
    expect(user?.name).toBe('바뀐이름');
  });

  it('오프라인이면 캐시된 프로필로 세션을 이어 간다(로그인 화면으로 튕기지 않음)', async () => {
    const repo = new AuthRepository();
    await signIn(repo);

    // 연결 없음 — fetch 가 원시 TypeError 를 던지는 상황.
    global.fetch = jest.fn(async () => { throw new TypeError('Network request failed'); }) as unknown as typeof fetch;

    const user = await repo.restore();
    expect(user?.name).toBe('원진섭');
    // 토큰은 살아 있어야 한다 — 연결이 돌아오면 그대로 계속 쓴다.
    expect(await secureStorage.getItem(StorageKeys.accessToken)).toBe('a-1');
  });

  // 실기기의 약전계에서는 fetch 가 즉시 실패하지 않고 **매달린다**.
  // 이 경로가 진짜 문제였다 — 재시도 3회 × 타임아웃이 곧 스플래시 정지 시간이다.
  it('응답 없이 매달리는 연결도 타임아웃 한 번으로 끝내고 캐시로 복구한다', async () => {
    const repo = new AuthRepository();
    await signIn(repo);

    const fetchMock = jest.fn(
      (_url: unknown, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          // 서버가 아무 응답도 주지 않는 상황. ApiClient 의 AbortController 만이 이걸 끊는다.
          init?.signal?.addEventListener('abort', () => {
            const e = new Error('Aborted');
            e.name = 'AbortError';
            reject(e);
          });
        }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const startedAt = Date.now();
    const user = await repo.restore();
    const elapsed = Date.now() - startedAt;

    expect(user?.name).toBe('원진섭');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // 타임아웃 한 번(120ms) 남짓이어야 한다. 재시도가 살아 있으면 3배 + 백오프로 늘어난다.
    expect(elapsed).toBeLessThan(400);
  });

  it('부팅 경로에서는 재시도하지 않는다(스플래시를 오래 붙잡지 않기 위해)', async () => {
    const repo = new AuthRepository();
    await signIn(repo);
    const fetchMock = jest.fn(async () => { throw new TypeError('Network request failed'); });
    global.fetch = fetchMock as unknown as typeof fetch;

    await repo.restore();
    // 기본 GET 정책(2회 재시도)이 걸리면 3회 호출 + 백오프로 화면이 멈춘다.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('서버가 세션을 거절하면(403 정지) 캐시로 되살리지 않고 로컬 세션을 정리한다', async () => {
    const repo = new AuthRepository();
    await signIn(repo);
    global.fetch = jest.fn(async () => jsonResp(403, { message: '이용이 정지된 계정입니다' })) as unknown as typeof fetch;

    await expect(repo.restore()).rejects.toBeInstanceOf(ApiError);
    // 정지된 사용자가 오프라인에서 캐시로 계속 쓰는 일이 없도록 캐시까지 지운다.
    expect(await secureStorage.getItem(StorageKeys.cachedUser)).toBeNull();
    expect(await secureStorage.getItem(StorageKeys.accessToken)).toBeNull();
  });

  it('캐시가 없으면(첫 설치 후 오프라인) 오류를 정직하게 전달한다', async () => {
    await secureStorage.setItem(StorageKeys.accessToken, 'a-1');
    global.fetch = jest.fn(async () => { throw new TypeError('Network request failed'); }) as unknown as typeof fetch;
    await expect(new AuthRepository().restore()).rejects.toBeInstanceOf(ApiError);
  });

  it('로그아웃하면 프로필 캐시도 함께 지운다', async () => {
    const repo = new AuthRepository();
    await signIn(repo);
    global.fetch = jest.fn(async () => jsonResp(200, { ok: true })) as unknown as typeof fetch;
    await repo.logout();
    expect(await secureStorage.getItem(StorageKeys.cachedUser)).toBeNull();
  });
});
