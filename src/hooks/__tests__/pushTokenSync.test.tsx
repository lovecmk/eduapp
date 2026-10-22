import React from 'react';
import { act, render } from '@testing-library/react-native';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { usePushTokenSync } from '../usePushTokenSync';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useAccountRestoreStore } from '../../store/accountRestoreStore';
import { getSessionEpoch } from '../../data/network/sessionEpoch';
import type { User } from '../../domain/models/User';

const mockSync = jest.fn().mockResolvedValue(true);
const mockRevoke = jest.fn().mockResolvedValue(undefined);
const mockConfigure = jest.fn();
const mockPull = jest.fn();
jest.mock('../../data/notifications/NotificationService', () => ({ syncPushTokenWithServer: (...args: unknown[]) => mockSync(...args), setCommunityNotificationPresentation: (...args: unknown[]) => mockConfigure(...args) }));
jest.mock('../../data/notifications/pushRegistration', () => ({ unregisterPushTokenWithServer: () => mockRevoke() }));
jest.mock('../useNotificationSync', () => ({ pullNotifications: () => mockPull() }));
jest.mock('expo-notifications', () => ({ addNotificationReceivedListener: () => ({ remove: jest.fn() }) }));
const Probe = () => { usePushTokenSync(); return null; };
let foreground: (state: AppStateStatus) => void;

beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { foreground = listener; return { remove: jest.fn() }; });
  useAuthStore.setState({ bootstrapped: true, user: { id: 'owner' } as User });
  useSettingsStore.setState(state => ({ notifications: { ...state.notifications, enabled: true, communityAlerts: true } }));
  useAccountRestoreStore.setState({ entries: {} });
});
afterEach(() => jest.restoreAllMocks());

it('waits for this account settings before registering and rechecks on foreground', async () => {
  render(<Probe />);
  expect(mockSync).not.toHaveBeenCalled();
  await act(async () => { useAccountRestoreStore.setState({ entries: { settings: { userId: 'owner', epoch: getSessionEpoch(), status: 'ready' } } }); });
  expect(mockSync).toHaveBeenCalledTimes(1);
  await act(async () => { foreground('active'); });
  expect(mockSync).toHaveBeenCalledTimes(2);
  await act(async () => { useSettingsStore.getState().updateNotificationSetting('enabled', false); });
  expect(mockRevoke).toHaveBeenCalled();
});

it('rejects foreground notifications for another account or after opt-out', async () => {
  await act(async () => { useAccountRestoreStore.setState({ entries: { settings: { userId: 'owner', epoch: getSessionEpoch(), status: 'ready' } } }); });
  render(<Probe />);
  const allowed = mockConfigure.mock.calls[0][0] as (data: Record<string, unknown>) => boolean;
  expect(allowed({ user_id: 'owner' })).toBe(true);
  expect(allowed({ user_id: 'other' })).toBe(false);
  await act(async () => { useSettingsStore.getState().updateNotificationSetting('communityAlerts', false); });
  expect(allowed({ user_id: 'owner' })).toBe(false);
  await act(async () => { useAuthStore.setState({ user: null }); });
  expect(allowed({ user_id: 'owner' })).toBe(false);
});
