const mockDisk = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async (key: string) => mockDisk.get(key) ?? null,
  setItem: async (key: string, value: string) => { mockDisk.set(key, value); },
  removeItem: async (key: string) => { mockDisk.delete(key); },
}));
import { useSettingsStore } from '../settingsStore';
import { useNotificationStore } from '../notificationStore';

it.each([0, 1])('restores actual legacy version %s preferences and account settings without resetting them', async version => {
  await useSettingsStore.persist.rehydrate();
  mockDisk.set('app-settings', JSON.stringify({ version, state: {
    themeMode: 'dark', fontScale: 'large', bio: 'saved profile', experience: '10년 이상',
    accountOwnerId: 'migration-user', accountUpdatedAt: 1234,
    notifications: { enabled: false, dailyReminderTime: '08:30', marketing: false },
  } }));
  await useSettingsStore.persist.rehydrate();
  expect(useSettingsStore.getState()).toMatchObject({
    themeMode: 'dark', fontScale: 'large', bio: 'saved profile', experience: '10년 이상',
    accountOwnerId: 'migration-user', accountUpdatedAt: 1234,
    notifications: { enabled: false, dailyReminderTime: '08:30', marketing: false },
  });
  expect(JSON.parse(mockDisk.get('app-settings')!).version).toBe(2);
});

it('migrates notification choices while discarding legacy demo notification contents', async () => {
  await useNotificationStore.persist.rehydrate();
  mockDisk.set('notifications', JSON.stringify({ version: 3, state: {
    mutedTypes: { achievement: true, system: false }, dismissedIds: ['dismissed', 'dismissed', null],
    items: [{ id: 'old-demo', title: 'legacy seeded notification' }],
  } }));
  await useNotificationStore.persist.rehydrate();
  expect(useNotificationStore.getState().items).toEqual([]);
  expect(useNotificationStore.getState().mutedTypes).toEqual({ new: true, remind: true, achievement: true, system: false });
  expect(useNotificationStore.getState().dismissedIds).toEqual(['dismissed']);
});
