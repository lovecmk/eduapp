const mockList = jest.fn();
jest.mock('../../data/repositories', () => ({ notificationRepository: { list: () => mockList() } }));
jest.mock('../../store/authStore', () => ({ useAuthStore: { getState: () => ({ user: { id: 'same-user' } }) } }));
import { pullNotifications } from '../useNotificationSync';
import { advanceSessionEpoch } from '../../data/network/sessionEpoch';
import { useNotificationStore } from '../../store/notificationStore';
import { waitFor } from '@testing-library/react-native';

it('같은 계정으로 재로그인해도 이전 알림 응답은 적용하지 않는다', async () => {
  let finish!: (items: never[]) => void;
  mockList.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const apply = jest.spyOn(useNotificationStore.getState(), 'applyServer');
  const pulling = pullNotifications();
  await waitFor(() => expect(mockList).toHaveBeenCalled());
  advanceSessionEpoch();
  finish([]);
  expect(await pulling).toBe(false);
  expect(apply).not.toHaveBeenCalled();
  apply.mockRestore();
});
