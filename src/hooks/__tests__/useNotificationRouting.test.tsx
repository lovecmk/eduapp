import { act, renderHook } from '@testing-library/react-native';
import { useAuthStore } from '../../store/authStore';
import { useNotificationRouting } from '../useNotificationRouting';

const mockNavigate = jest.fn();
const mockRouter = { navigate: mockNavigate };
let mockListener: (response: unknown) => void;
const mockRemove = jest.fn();
const response = (id: string, route = '/review') => ({ actionIdentifier: 'default',
  notification: { request: { identifier: id, content: { data: { route } } } } });
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('expo-notifications', () => ({
  DEFAULT_ACTION_IDENTIFIER: 'default',
  addNotificationResponseReceivedListener: jest.fn(cb => { mockListener = cb; return { remove: mockRemove }; }),
  getLastNotificationResponseAsync: jest.fn(() => Promise.resolve(response('cold'))),
}));

afterEach(() => { useAuthStore.setState({ user: null }); jest.clearAllMocks(); });
it('cold and warm reminder taps navigate to the review tab once, and unsubscribe', async () => {
  useAuthStore.setState({ bootstrapped: true, user: { id: 'notification-test' } as never });
  const { unmount } = renderHook(useNotificationRouting);
  await act(async () => { await Promise.resolve(); });
  expect(mockNavigate).toHaveBeenCalledWith('/(tabs)/review');
  act(() => { mockListener(response('warm')); mockListener(response('warm')); });
  expect(mockNavigate).toHaveBeenCalledTimes(2);
  unmount();
  expect(mockRemove).toHaveBeenCalled();
});
it('a signed out session never navigates from an old notification', async () => {
  useAuthStore.setState({ bootstrapped: true, user: null });
  renderHook(useNotificationRouting);
  await act(async () => { await Promise.resolve(); });
  expect(mockNavigate).not.toHaveBeenCalled();
});
