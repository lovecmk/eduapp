jest.mock('../../data/network/env', () => ({ env: { useMockData: false, apiBaseUrl: 'https://test.invalid' } }));
/**
 * 관리자 모드 진입(로그인 화면 로고 5번 두드리기)이 실제로 관리자 세션을 만드는지.
 *
 * 두 배포 모드가 서로 다른 길을 탄다는 게 이 기능의 핵심이라, 둘 다 확인한다.
 *  · 목업  — mockUserDb 에 심어 둔 계정으로 평소 로그인 경로를 그대로 탄다.
 *  · 실서버 — 그 경로가 없어(501) 화면만 여는 로컬 세션으로 폴백한다.
 * 어느 쪽이든 결과가 `isAdmin: true` 여야 관리자 전용 화면이 열린다.
 */
import type { AuthSession } from '../../domain/repositories/IAuthRepository';

const socialLogin = jest.fn<Promise<AuthSession>, [string, string]>();

jest.mock('../../data/repositories', () => ({
  authRepository: { socialLogin: (n: string, e: string) => socialLogin(n, e) },
}));

const setQueueOwner = jest.fn<void, [string | null]>();
jest.mock('../../data/network/offlineQueue', () => ({ setQueueOwner: (id: string | null) => setQueueOwner(id) }));

const applySessionOwner = jest.fn(async (_id: string | null) => {});
jest.mock('../sessionScope', () => ({ applySessionOwner: (id: string | null) => applySessionOwner(id) }));

import { useAuthStore } from '../authStore';
import { ADMIN_DEMO_USER } from '../../data/auth/adminDemoAccount';

beforeEach(() => {
  socialLogin.mockReset();
  useAuthStore.setState({ user: null, loading: false, error: null });
});

describe('adminLogin', () => {
  it('목업 모드: 심어 둔 데모 계정으로 들어가고 관리자 권한이 붙는다', async () => {
    socialLogin.mockResolvedValue({
      // 저장소가 비관리자로 돌려주더라도 관리자 모드로 승격되어야 한다.
      user: { ...ADMIN_DEMO_USER, isAdmin: false },
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
    });

    await expect(useAuthStore.getState().adminLogin()).resolves.toBe(true);

    expect(socialLogin).toHaveBeenCalledWith(ADMIN_DEMO_USER.name, ADMIN_DEMO_USER.email);
    expect(useAuthStore.getState().user).toMatchObject({ name: '이용재', isAdmin: true });
    expect(useAuthStore.getState().loading).toBe(false);
  });

  it('실서버 모드: 간편 로그인 경로가 없어도(501) 로컬 관리자 세션으로 들어간다', async () => {
    socialLogin.mockRejectedValue(new Error('간편 로그인은 아직 준비 중이에요.'));

    await expect(useAuthStore.getState().adminLogin()).resolves.toBe(true);

    expect(useAuthStore.getState().user).toMatchObject({ name: '이용재', isAdmin: true });
    // 서버 오류를 화면에 흘리면 "관리자 모드는 열렸는데 빨간 글씨가 남아 있는" 상태가 된다.
    expect(useAuthStore.getState().error).toBeNull();
  });

  it('세션의 주인도 함께 관리자 계정으로 바뀐다(공용 기기에서 앞사람 데이터가 넘어오지 않게)', async () => {
    socialLogin.mockRejectedValue(new Error('nope'));
    setQueueOwner.mockClear();
    applySessionOwner.mockClear();

    await useAuthStore.getState().adminLogin();

    expect(setQueueOwner).toHaveBeenCalledWith(ADMIN_DEMO_USER.id);
    expect(applySessionOwner).toHaveBeenCalledWith(ADMIN_DEMO_USER.id);
  });
});
