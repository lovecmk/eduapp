const mockLogin = jest.fn();
const mockRestore = jest.fn();
const mockUpdate = jest.fn();
jest.mock('../../data/repositories', () => ({ authRepository: { login: (...args: unknown[]) => mockLogin(...args), restore: () => mockRestore(), updateProfile: (...args: unknown[]) => mockUpdate(...args), logout: async () => {} } }));
jest.mock('../../data/network/offlineQueue', () => ({ setQueueOwner: () => {} }));
jest.mock('../sessionScope', () => ({ applySessionOwner: async () => {} }));
import { useAuthStore } from '../authStore';
import type { User } from '../../domain/models/User';

const user: User = { id: 'qa-a', name: 'QA', email: 'qa@example.test', membership: 'basic', createdAt: new Date(), isActive: true, isAdmin: false };
beforeEach(() => {
  mockLogin.mockReset(); mockRestore.mockReset(); mockUpdate.mockReset();
  useAuthStore.setState({ user: null, bootstrapped: true, loading: false, error: null, sessionEndedReason: null });
});
it('로그인 연타가 중복 요청을 만들지 않는다', async () => {
  let finish!: (session: { user: User }) => void;
  mockLogin.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const first = useAuthStore.getState().login('qa', 'pw');
  expect(await useAuthStore.getState().login('qa', 'pw')).toBe(false);
  expect(mockLogin).toHaveBeenCalledTimes(1);
  finish({ user });
  expect(await first).toBe(true);
});
it('복구 중 로그아웃하면 늦은 복구가 세션을 되살리지 않는다', async () => {
  let finish!: (user: User) => void;
  mockRestore.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const first = useAuthStore.getState().restore();
  const second = useAuthStore.getState().restore();
  expect(second).toBe(first);
  await useAuthStore.getState().logout();
  finish(user);
  await first;
  expect(useAuthStore.getState().user).toBeNull();
  expect(mockRestore).toHaveBeenCalledTimes(1);
});
it('앞사람의 프로필 저장 응답이 뒷사람 세션을 덮지 않는다', async () => {
  useAuthStore.setState({ user });
  let finish!: (user: User) => void;
  mockUpdate.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const updating = useAuthStore.getState().updateProfile({ name: '옛 수정' });
  await useAuthStore.getState().logout();
  const other = { ...user, id: 'qa-b', name: '다른 사용자' };
  mockLogin.mockResolvedValue({ user: other });
  await useAuthStore.getState().login('other', 'pw');
  finish({ ...user, name: '옛 수정' });
  expect(await updating).toBe(false);
  expect(useAuthStore.getState().user).toEqual(other);
});
