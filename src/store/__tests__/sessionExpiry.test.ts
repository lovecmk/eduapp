jest.mock('../../data/network/env', () => ({ env: { useMockData: false, apiBaseUrl: 'https://test.invalid' } }));
/**
 * 쓰는 도중 서버가 세션을 끊었을 때 — 화면이 로그인 상태로 남지 않는가.
 *
 * 과거 결함: ApiClient 는 refresh 까지 실패하면 토큰만 지우고 401 을 던졌다.
 * authStore.user 는 그대로라 사용자는 로그인된 화면에서 누르는 것마다 오류를 받았고,
 * 스스로 로그아웃을 찾아 누르기 전까지 다시 로그인할 길이 화면에 없었다.
 *
 * 생체인증 잠금의 대상(needsUnlock)도 함께 고정한다 — 저장된 세션으로 **되살아난**
 * 실행만 잠그고, 방금 비밀번호로 들어온 사람에게는 묻지 않는다.
 */
import type { User } from '../../domain/models/User';

const restore = jest.fn<Promise<User | null>, []>();
const login = jest.fn();
const logout = jest.fn<Promise<void>, []>();

jest.mock('../../data/repositories', () => ({
  authRepository: { restore: () => restore(), login: (...a: unknown[]) => login(...a), logout: () => logout() },
}));
jest.mock('../../data/network/offlineQueue', () => ({ setQueueOwner: () => {} }));
jest.mock('../sessionScope', () => ({ applySessionOwner: async () => {} }));

import { useAuthStore } from '../authStore';
import { emitSessionExpired } from '../../data/network/sessionEvents';

const someUser: User = {
  id: 'u-1', name: '원진섭', email: 'won@example.com', membership: 'basic',
  createdAt: new Date(), isActive: true, isAdmin: false,
};

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  restore.mockReset();
  login.mockReset();
  logout.mockReset();
  useAuthStore.setState({ user: null, bootstrapped: true, error: null, sessionEndedReason: null, needsUnlock: false });
});

describe('쓰는 도중의 세션 만료', () => {
  it('만료 신호를 받으면 로그인 상태를 닫고 사유를 남긴다', async () => {
    useAuthStore.setState({ user: someUser });
    emitSessionExpired();
    await flush();

    const s = useAuthStore.getState();
    expect(s.user).toBeNull();
    expect(s.sessionEndedReason).toContain('다시 로그인');
  });

  it('이미 로그아웃된 상태면 아무것도 바꾸지 않는다', async () => {
    emitSessionExpired();
    await flush();
    expect(useAuthStore.getState().sessionEndedReason).toBeNull();
  });

  it('스스로 로그아웃하는 중에 받은 401 은 만료로 안내하지 않는다', async () => {
    useAuthStore.setState({ user: someUser });
    logout.mockImplementation(async () => { emitSessionExpired(); });

    await useAuthStore.getState().logout();
    await flush();

    const s = useAuthStore.getState();
    expect(s.user).toBeNull();
    expect(s.sessionEndedReason).toBeNull();
  });
});

describe('생체인증 잠금 대상(needsUnlock)', () => {
  it('저장된 세션으로 되살아난 실행은 잠금 대상이다', async () => {
    restore.mockResolvedValue(someUser);
    await useAuthStore.getState().restore();
    expect(useAuthStore.getState().needsUnlock).toBe(true);

    useAuthStore.getState().unlock();
    expect(useAuthStore.getState().needsUnlock).toBe(false);
  });

  it('방금 비밀번호로 들어온 사람에게는 묻지 않는다', async () => {
    useAuthStore.setState({ needsUnlock: true });
    login.mockResolvedValue({ user: someUser });
    await useAuthStore.getState().login('won', 'pw12345678');
    expect(useAuthStore.getState().needsUnlock).toBe(false);
  });
});
