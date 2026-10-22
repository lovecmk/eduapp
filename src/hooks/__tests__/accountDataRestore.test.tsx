import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useCollectionSync } from '../useCollectionSync';
import { useSettingsSync } from '../useSettingsSync';
import { useEngagementSync } from '../useEngagementSync';
import { useCollectionStore } from '../../store/collectionStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useLikeStore } from '../../store/likeStore';
import { useBookmarkStore } from '../../store/bookmarkStore';
import { useAccountRestoreStore } from '../../store/accountRestoreStore';
import { advanceSessionEpoch } from '../../data/network/sessionEpoch';

const mockSettingsPull = jest.fn(), mockSettingsPush = jest.fn();
const mockCollectionPull = jest.fn(), mockCollectionSync = jest.fn();
const mockEngagementPull = jest.fn(), mockLike = jest.fn(), mockBookmark = jest.fn(), mockFlush = jest.fn();
jest.mock('../../store/authStore', () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'recovery-user' } }) }));
jest.mock('../../data/network/ApiClient', () => ({ apiClient: { flushPendingWrites: () => mockFlush() } }));
jest.mock('../../data/repositories', () => ({
  settingsRepository: { pull: () => mockSettingsPull(), push: (...args: unknown[]) => mockSettingsPush(...args) },
  collectionRepository: { pull: () => mockCollectionPull(), sync: (...args: unknown[]) => mockCollectionSync(...args) },
  engagementRepository: { pull: () => mockEngagementPull(), setLiked: (...args: unknown[]) => mockLike(...args), setBookmarked: (...args: unknown[]) => mockBookmark(...args) },
}));

beforeEach(() => {
  advanceSessionEpoch();
  useAccountRestoreStore.setState({ entries: {}, retry: 0 });
  useCollectionStore.getState().reset();
  useSettingsStore.getState().resetAccountSettings('recovery-user');
  useLikeStore.setState({ ids: [] }); useBookmarkStore.setState({ ids: [] });
  for (const store of [useCollectionStore, useSettingsStore, useLikeStore, useBookmarkStore]) jest.spyOn(store.persist, 'hasHydrated').mockReturnValue(true);
  for (const fn of [mockSettingsPull, mockSettingsPush, mockCollectionPull, mockCollectionSync, mockEngagementPull, mockLike, mockBookmark, mockFlush]) fn.mockReset();
  mockFlush.mockResolvedValue(0); mockSettingsPush.mockResolvedValue(undefined);
  mockLike.mockResolvedValue(undefined); mockBookmark.mockResolvedValue(undefined);
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

it('does not send empty collection defaults before a delayed reinstall snapshot arrives', async () => {
  jest.useFakeTimers();
  let finish!: (value: unknown) => void;
  mockCollectionPull.mockReturnValue(new Promise(done => { finish = done; }));
  const remote = { ...useCollectionStore.getState().snapshot(), owned: { saved: 3 }, packsEarned: 20 };
  const hook = renderHook(() => useCollectionSync());
  await act(async () => { await jest.advanceTimersByTimeAsync(5000); });
  expect(mockCollectionSync).not.toHaveBeenCalled();
  await act(async () => { finish(remote); });
  expect(useCollectionStore.getState().owned).toEqual({ saved: 3 });
  expect(useCollectionStore.getState().packsEarned).toBe(20);
  expect(useAccountRestoreStore.getState().entries.collection?.status).toBe('ready');
  hook.unmount();
});

it('restores server settings without pushing startup defaults or changing device preferences', async () => {
  useSettingsStore.setState({ themeMode: 'dark', fontScale: 'large' });
  mockSettingsPull.mockResolvedValue({ present: true, updatedAt: new Date().toISOString(), settings: { bio: 'restored profile', dailyTarget: 7, experience: '10년 이상' } });
  const hook = renderHook(() => useSettingsSync());
  await waitFor(() => expect(useAccountRestoreStore.getState().entries.settings?.status).toBe('ready'));
  expect(useSettingsStore.getState()).toMatchObject({ bio: 'restored profile', dailyTarget: 7, experience: '10년 이상', themeMode: 'dark', fontScale: 'large' });
  expect(mockSettingsPush).not.toHaveBeenCalled();
  hook.unmount();
});

it('does not overwrite unknown server settings while the first lookup is still pending', async () => {
  jest.useFakeTimers();
  mockSettingsPull.mockReturnValue(new Promise(() => {}));
  const hook = renderHook(() => useSettingsSync());
  await act(async () => {});
  act(() => { useSettingsStore.getState().setBio('local edit'); });
  await act(async () => { await jest.advanceTimersByTimeAsync(3000); });
  expect(mockSettingsPush).not.toHaveBeenCalled();
  hook.unmount();
});

it('restores likes/bookmarks without replaying them as fresh user actions and ignores expired-session changes', async () => {
  mockEngagementPull.mockResolvedValue({ likedIds: ['saved-like'], bookmarkedIds: ['saved-bookmark'] });
  const hook = renderHook(() => useEngagementSync());
  await waitFor(() => expect(useAccountRestoreStore.getState().entries.engagement?.status).toBe('ready'));
  expect(useLikeStore.getState().ids).toEqual(['saved-like']);
  expect(useBookmarkStore.getState().ids).toEqual(['saved-bookmark']);
  expect(mockLike).not.toHaveBeenCalled(); expect(mockBookmark).not.toHaveBeenCalled();
  act(() => { useLikeStore.getState().toggle('user-picked'); });
  expect(mockLike).toHaveBeenCalledWith('user-picked', true);
  advanceSessionEpoch();
  act(() => { useLikeStore.getState().toggle('expired-session'); });
  expect(mockLike).toHaveBeenCalledTimes(1);
  hook.unmount();
});

it('keeps an error distinct from empty data and retries all requested resources', async () => {
  mockEngagementPull.mockRejectedValue(new Error('offline'));
  const hook = renderHook(() => useEngagementSync());
  await waitFor(() => expect(useAccountRestoreStore.getState().entries.engagement?.status).toBe('error'));
  mockEngagementPull.mockResolvedValue({ likedIds: ['restored'], bookmarkedIds: [] });
  act(() => { useAccountRestoreStore.getState().retryFailed(); });
  await waitFor(() => expect(useLikeStore.getState().ids).toEqual(['restored']));
  expect(useAccountRestoreStore.getState().entries.engagement?.status).toBe('ready');
  expect(mockLike).not.toHaveBeenCalled();
  hook.unmount();
});
