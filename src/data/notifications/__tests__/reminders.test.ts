const mockSchedules = new Map<string, any>();
const mockPermission = jest.fn();
const mockAccess = jest.fn();
const mockSchedule = jest.fn();
const mockCancel = jest.fn();
const mockChannel = jest.fn();
const mockRequestPermission = jest.fn();
const mockNext = jest.fn();
jest.mock('react-native', () => ({ Platform: { OS: 'android' }, Vibration: { vibrate: jest.fn() }, NativeModules: { ReminderAlarm: { getStatus: () => mockAccess(), openExactSettings: jest.fn() } } }));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(), AndroidImportance: { HIGH: 4 }, SchedulableTriggerInputTypes: { DAILY: 'daily' },
  setNotificationChannelAsync: (...args: unknown[]) => mockChannel(...args),
  getPermissionsAsync: () => mockPermission(), requestPermissionsAsync: () => mockRequestPermission(),
  getAllScheduledNotificationsAsync: async () => [...mockSchedules.values()],
  cancelScheduledNotificationAsync: (...args: unknown[]) => mockCancel(...args),
  scheduleNotificationAsync: (...args: unknown[]) => mockSchedule(...args),
  getNextTriggerDateAsync: (...args: unknown[]) => mockNext(...args),
}));
jest.mock('expo-constants', () => ({ __esModule: true, default: {} }));
jest.mock('../../network/env', () => ({ env: { apiBaseUrl: '' } }));
jest.mock('../../network/ApiClient', () => ({ apiClient: {} }));
jest.mock('../../../utils/haptics', () => ({ hapticSuccess: jest.fn() }));
import { reconcileDailyReminder, requestNotificationPermission } from '../NotificationService';
import { useReminderStatusStore } from '../../../store/reminderStatusStore';

const access = { exact: true, notificationsEnabled: true, channelEnabled: true };
beforeEach(() => {
  mockSchedules.clear();
  mockPermission.mockResolvedValue({ status: 'granted' });
  mockAccess.mockResolvedValue(access);
  mockChannel.mockResolvedValue(undefined);
  mockNext.mockResolvedValue(Date.now() + 86_400_000);
  mockRequestPermission.mockResolvedValue({ status: 'granted' });
  mockSchedule.mockImplementation(async request => { mockSchedules.set(request.identifier, request); return request.identifier; });
  mockCancel.mockImplementation(async id => { mockSchedules.delete(id); });
});
it('schedules exactly one daily wall-clock reminder with the configured hour/minute/channel', async () => {
  await reconcileDailyReminder('07:30');
  expect(mockSchedules.size).toBe(1);
  const reminder = [...mockSchedules.values()][0];
  expect(reminder.trigger).toEqual({ type: 'daily', hour: 7, minute: 30, channelId: 'study-reminders' });
  expect(reminder.content.data).toMatchObject({ time: '07:30', exact: true, reminder: 'daily-study' });
  expect(useReminderStatusStore.getState()).toMatchObject({ state: 'scheduled', time: '07:30', exact: true });
  expect(mockRequestPermission).not.toHaveBeenCalled();
});
it('keeps a matching schedule on foreground reconciliation', async () => {
  await reconcileDailyReminder('07:30'); await reconcileDailyReminder('07:30');
  expect(mockSchedule).toHaveBeenCalledTimes(1);
  expect(mockCancel).not.toHaveBeenCalled();
});
it('changes the time and removes only our schedule', async () => {
  mockSchedules.set('unrelated', { identifier: 'unrelated', content: { title: '다른 알림' }, trigger: { type: 'date' } });
  await reconcileDailyReminder('07:30'); await reconcileDailyReminder('18:45');
  expect(mockSchedules.size).toBe(2);
  expect(mockSchedules.has('unrelated')).toBe(true);
  expect(mockSchedule.mock.calls[1][0].trigger).toMatchObject({ hour: 18, minute: 45 });
});
it('logout/disable cancels the reminder while preserving unrelated requests', async () => {
  mockSchedules.set('unrelated', { identifier: 'unrelated', content: { title: '다른 알림' }, trigger: {} });
  await reconcileDailyReminder('08:00'); await reconcileDailyReminder(null);
  expect([...mockSchedules.keys()]).toEqual(['unrelated']);
  expect(useReminderStatusStore.getState().state).toBe('disabled');
});
it('rapid concurrent setting changes retain only the latest requested time', async () => {
  await Promise.all([reconcileDailyReminder('07:30'), reconcileDailyReminder('09:15'), reconcileDailyReminder('23:59')]);
  expect(mockSchedule).toHaveBeenCalledTimes(1);
  expect(mockSchedule.mock.calls[0][0].trigger).toMatchObject({ hour: 23, minute: 59 });
});
it('a logout queued during a slow native schedule removes the completed stale schedule', async () => {
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>(done => { entered = done; });
  mockSchedule.mockImplementationOnce(async request => {
    entered(); await new Promise<void>(done => { release = done; });
    mockSchedules.set(request.identifier, request); return request.identifier;
  });
  const old = reconcileDailyReminder('08:00'); await started;
  const logout = reconcileDailyReminder(null); release();
  await Promise.all([old, logout]);
  expect(mockSchedules.size).toBe(0);
});
it('permission revocation cancels stale alarms and foreground recovery restores them', async () => {
  await reconcileDailyReminder('08:00');
  mockPermission.mockResolvedValue({ status: 'denied' });
  await reconcileDailyReminder('08:00');
  expect(mockSchedules.size).toBe(0);
  expect(useReminderStatusStore.getState().state).toBe('permission-denied');
  mockPermission.mockResolvedValue({ status: 'granted' });
  await reconcileDailyReminder('08:00');
  expect(mockSchedules.size).toBe(1);
});
it.each(['notificationsEnabled', 'channelEnabled'])('exposes blocked %s without claiming a working alarm', async field => {
  mockAccess.mockResolvedValue({ ...access, [field]: false });
  await reconcileDailyReminder('08:00');
  expect(mockSchedule).not.toHaveBeenCalled();
  expect(useReminderStatusStore.getState().state).toBe('permission-denied');
});
it('records exact access and refreshes the native request after an exact-alarm grant', async () => {
  mockAccess.mockResolvedValue({ ...access, exact: false });
  await reconcileDailyReminder('08:00');
  expect(useReminderStatusStore.getState().exact).toBe(false);
  mockAccess.mockResolvedValue(access); await reconcileDailyReminder('08:00');
  expect(mockSchedule).toHaveBeenCalledTimes(2);
  expect([...mockSchedules.values()][0].content.data.exact).toBe(true);
});
it.each(['24:00', '09:60', '9:00', 'garbage'])('rejects invalid time %s', async time => {
  await expect(reconcileDailyReminder(time)).rejects.toThrow('00:00~23:59');
  expect(mockSchedule).not.toHaveBeenCalled();
});
it('handles a native trigger failure and allows retry', async () => {
  mockNext.mockResolvedValueOnce(null);
  await expect(reconcileDailyReminder('00:00')).rejects.toThrow('계산할 수 없습니다');
  expect(useReminderStatusStore.getState().state).toBe('failed');
  await reconcileDailyReminder('00:00');
  expect(useReminderStatusStore.getState().state).toBe('scheduled');
});
it('creates the Android channel before asking Android 13+ notification permission', async () => {
  await requestNotificationPermission();
  expect(mockChannel.mock.invocationCallOrder[0]).toBeLessThan(mockRequestPermission.mock.invocationCallOrder[0]);
});
it('cleans up legacy three-hour alarms without cancelling an immediate test notification', async () => {
  for (const seconds of [10_800, 1]) mockSchedules.set(`legacy-${seconds}`, { identifier: `legacy-${seconds}`, content: { title: '오늘의 학습 알림' }, trigger: { type: 'timeInterval', seconds } });
  await reconcileDailyReminder('08:00');
  expect(mockSchedules.has('legacy-10800')).toBe(false);
  expect(mockSchedules.has('legacy-1')).toBe(true);
});
