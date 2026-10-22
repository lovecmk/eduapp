import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useReminderSchedule } from '../useReminderSchedule';
const mockReconcile = jest.fn(async () => {});
jest.mock('../../data/notifications/NotificationService', () => ({ reconcileDailyReminder: (...args: unknown[]) => mockReconcile(...args as []) }));

let foreground: (state: string) => void;
const remove = jest.fn();
beforeEach(() => {
  useAuthStore.setState({ bootstrapped: true, user: { id: 'reminder-user' } as never });
  useSettingsStore.setState(state => ({ notifications: { ...state.notifications, enabled: true, dailyReminderTime: '07:30' } }));
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => { foreground = callback as (state: string) => void; return { remove }; });
});
afterEach(() => jest.restoreAllMocks());

it('restores the reminder on foreground return and uses the latest saved time', async () => {
  const view = renderHook(() => useReminderSchedule());
  await waitFor(() => expect(mockReconcile).toHaveBeenLastCalledWith('07:30'));
  act(() => { foreground('background'); foreground('active'); });
  expect(mockReconcile).toHaveBeenCalledTimes(2);
  act(() => { useSettingsStore.getState().updateNotificationSetting('dailyReminderTime', '18:45'); });
  await waitFor(() => expect(mockReconcile).toHaveBeenLastCalledWith('18:45'));
  act(() => foreground('active'));
  expect(mockReconcile).toHaveBeenLastCalledWith('18:45');
  view.unmount(); expect(remove).toHaveBeenCalled();
});
it('disabling or signing out requests cancellation and never retains the previous user alarm', async () => {
  const view = renderHook(() => useReminderSchedule());
  await waitFor(() => expect(mockReconcile).toHaveBeenLastCalledWith('07:30'));
  act(() => { useSettingsStore.getState().updateNotificationSetting('enabled', false); });
  await waitFor(() => expect(mockReconcile).toHaveBeenLastCalledWith(null));
  act(() => { useAuthStore.setState({ user: null }); useSettingsStore.getState().updateNotificationSetting('enabled', true); });
  act(() => foreground('active'));
  expect(mockReconcile).toHaveBeenLastCalledWith(null);
  view.unmount();
});
it('waits for authentication bootstrap before touching device schedules', async () => {
  useAuthStore.setState({ bootstrapped: false });
  const view = renderHook(() => useReminderSchedule());
  await act(async () => { await Promise.resolve(); });
  expect(mockReconcile).not.toHaveBeenCalled();
  act(() => { useAuthStore.setState({ bootstrapped: true }); });
  await waitFor(() => expect(mockReconcile).toHaveBeenLastCalledWith('07:30'));
  view.unmount();
});
