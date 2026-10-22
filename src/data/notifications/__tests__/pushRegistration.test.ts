const mockPermission = jest.fn();
const mockToken = jest.fn();
const mockRequest = jest.fn();
const mockPost = jest.fn();
const mockDurable = jest.fn();
const mockRead = jest.fn();
const mockWrite = jest.fn();
let mockEpoch = 1;
jest.mock('react-native', () => ({ Platform: { OS: 'android' }, Vibration: {}, NativeModules: {} }));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(), AndroidImportance: { HIGH: 4, DEFAULT: 3 },
  getPermissionsAsync: () => mockPermission(), requestPermissionsAsync: () => mockRequest(),
  getExpoPushTokenAsync: () => mockToken(), setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-constants', () => ({ __esModule: true, default: {} }));
jest.mock('../../network/env', () => ({ env: { apiBaseUrl: 'https://isolated.test' } }));
jest.mock('../../network/ApiClient', () => ({ apiClient: { post: (...args: unknown[]) => mockPost(...args), postDurable: (...args: unknown[]) => mockDurable(...args) } }));
jest.mock('../../network/sessionEpoch', () => ({ getSessionEpoch: () => mockEpoch }));
jest.mock('../../storage/secureStorage', () => ({ secureStorage: { getItem: () => mockRead(), setItem: (...args: unknown[]) => mockWrite(...args) }, StorageKeys: { pushToken: 'devicePushToken' } }));
jest.mock('../../../utils/haptics', () => ({ hapticSuccess: jest.fn() }));
import { syncPushTokenWithServer } from '../NotificationService';
import { unregisterPushTokenWithServer } from '../pushRegistration';

beforeEach(() => {
  jest.clearAllMocks(); mockEpoch = 1;
  mockPermission.mockResolvedValue({ status: 'granted' });
  mockToken.mockResolvedValue({ data: 'ExpoPushToken[device]' });
  mockRead.mockResolvedValue(null); mockDurable.mockResolvedValue(undefined); mockPost.mockResolvedValue(undefined);
});

it('registers only an already permitted device and remembers its token', async () => {
  expect(await syncPushTokenWithServer()).toBe(true);
  expect(mockRequest).not.toHaveBeenCalled();
  expect(mockDurable).toHaveBeenCalledWith('/inner/api/v1/push/register', { token: 'ExpoPushToken[device]', platform: 'android' }, 'push:ExpoPushToken[device]');
  expect(mockWrite).toHaveBeenCalledWith('devicePushToken', 'ExpoPushToken[device]');
});

it('revokes an existing device registration after OS permission is denied without prompting', async () => {
  mockRead.mockResolvedValue('ExpoPushToken[device]');
  mockPermission.mockResolvedValue({ status: 'denied' });
  expect(await syncPushTokenWithServer()).toBe(false);
  expect(mockRequest).not.toHaveBeenCalled(); expect(mockToken).not.toHaveBeenCalled();
  expect(mockDurable).toHaveBeenCalledWith('/inner/api/v1/push/unregister', { token: 'ExpoPushToken[device]' });
});

it('does not register a token resolved after the login session changes', async () => {
  mockToken.mockImplementation(async () => { mockEpoch++; return { data: 'ExpoPushToken[device]' }; });
  expect(await syncPushTokenWithServer()).toBe(false);
  expect(mockDurable).not.toHaveBeenCalled();
});

it('does not register after notification consent changes during token lookup', async () => {
  expect(await syncPushTokenWithServer(() => false)).toBe(false);
  expect(mockDurable).not.toHaveBeenCalled();
});

it('revokes directly before logout and tolerates an older backend without unregister', async () => {
  mockRead.mockResolvedValue('ExpoPushToken[device]'); mockPost.mockRejectedValue(new Error('old backend'));
  await expect(unregisterPushTokenWithServer(false)).resolves.toBeUndefined();
  expect(mockPost).toHaveBeenCalledWith('/inner/api/v1/push/unregister', { token: 'ExpoPushToken[device]' });
});
