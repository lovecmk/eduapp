import React from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { useFactionSync } from '../useFactionSync';
import { useFactionStore } from '../../store/factionStore';
import FactionSelectScreen from '../../../app/faction-select';
import { ApiError } from '../../data/network/errors';
import { useAccountRestoreStore } from '../../store/accountRestoreStore';
import { confirmFaction } from '../../data/sync/faction';
import { advanceSessionEpoch } from '../../data/network/sessionEpoch';

const mockGet = jest.fn(), mockSet = jest.fn(), mockBack = jest.fn();
jest.mock('../../data/repositories', () => ({ factionRepository: { get: () => mockGet(), set: (...args: unknown[]) => mockSet(...args) } }));
jest.mock('../../store/authStore', () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'restore-user' } }) }));
jest.mock('../useGoBack', () => ({ useGoBack: () => mockBack }));
jest.mock('../../components/settings/ExperienceStep', () => ({ ExperienceStep: ({ onContinue }: { onContinue: () => void }) => {
  const { Text } = require('react-native');
  return <Text onPress={onContinue}>경력 선택 계속</Text>;
} }));

function RestoreScreen() { useFactionSync(); return <ThemeProvider><FactionSelectScreen /></ThemeProvider>; }
beforeEach(() => {
  useFactionStore.setState({ faction: null });
  useAccountRestoreStore.setState({ entries: {}, retry: 0 });
  mockGet.mockReset(); mockSet.mockReset(); mockBack.mockReset();
  mockSet.mockResolvedValue(undefined);
  jest.spyOn(useFactionStore.persist, 'hasHydrated').mockReturnValue(true);
});
afterEach(() => jest.restoreAllMocks());

it('does not offer a new faction while reinstall recovery is still reading the original faction', async () => {
  let finish!: (value: string) => void;
  mockGet.mockReturnValue(new Promise(done => { finish = done; }));
  render(<RestoreScreen />);
  expect(screen.queryByText('경력 선택 계속')).toBeNull();
  await act(async () => { finish('frost'); });
  await waitFor(() => expect(useFactionStore.getState().faction).toBe('frost'));
  expect(mockSet).not.toHaveBeenCalled();
});

it('keeps the original server faction when a previously incorrect local selection is restored', async () => {
  useFactionStore.setState({ faction: 'flame' });
  mockGet.mockResolvedValue('frost');
  const hook = renderHook(() => useFactionSync());
  await waitFor(() => expect(useFactionStore.getState().faction).toBe('frost'));
  expect(mockSet).not.toHaveBeenCalled();
  hook.unmount();
});

it('does not treat a failed server lookup as a new account', async () => {
  mockGet.mockRejectedValue(new ApiError(503, 'temporary failure'));
  render(<RestoreScreen />);
  await waitFor(() => expect(mockGet).toHaveBeenCalled());
  expect(screen.queryByText('경력 선택 계속')).toBeNull();
  expect(useFactionStore.getState().faction).toBeNull();
  expect(mockSet).not.toHaveBeenCalled();
});

it('waits for the server acknowledgement and prevents repeated selection writes', async () => {
  mockGet.mockResolvedValue(null);
  const hook = renderHook(() => useFactionSync());
  await waitFor(() => expect(useAccountRestoreStore.getState().entries.faction?.status).toBe('ready'));
  let finish!: () => void;
  mockSet.mockReturnValue(new Promise<void>(done => { finish = done; }));
  let saving!: Promise<unknown>;
  act(() => { saving = confirmFaction('restore-user', 'flame'); });
  expect(useFactionStore.getState().faction).toBeNull();
  await act(async () => { expect(await confirmFaction('restore-user', 'volt')).toBeNull(); });
  await act(async () => { finish(); await saving; });
  expect(useFactionStore.getState().faction).toBe('flame');
  expect(mockSet).toHaveBeenCalledTimes(1);
  hook.unmount();
});

it('restores the original immutable server faction after a 409 instead of claiming a new choice', async () => {
  mockGet.mockResolvedValueOnce(null).mockResolvedValue('frost');
  mockSet.mockRejectedValue(new ApiError(409, 'fixed faction'));
  const hook = renderHook(() => useFactionSync());
  await waitFor(() => expect(useAccountRestoreStore.getState().entries.faction?.status).toBe('ready'));
  await act(async () => { expect(await confirmFaction('restore-user', 'flame')).toBe('frost'); });
  expect(useFactionStore.getState().faction).toBe('frost');
  hook.unmount();
});

it('keeps an unconfirmed choice out of persistence when the server fails, then recovers on retry', async () => {
  mockGet.mockResolvedValue(null);
  mockSet.mockRejectedValue(new ApiError(503, 'temporary failure'));
  render(<RestoreScreen />);
  await waitFor(() => expect(screen.getByText('경력 선택 계속')).toBeTruthy());
  fireEvent.press(screen.getByText('경력 선택 계속'));
  fireEvent.press(screen.getByText('플레임'));
  fireEvent.press(screen.getByText('플레임 진영으로 시작하기'));
  await waitFor(() => expect(screen.getByText('기존 진영을 확인하지 못했어요')).toBeTruthy());
  expect(useFactionStore.getState().faction).toBeNull();
  expect(mockBack).not.toHaveBeenCalled();
  mockGet.mockResolvedValue('frost');
  fireEvent.press(screen.getByText('진영 다시 불러오기'));
  await waitFor(() => expect(useFactionStore.getState().faction).toBe('frost'));
});

it('does not apply a previous account response after the session changes', async () => {
  let finish!: (value: string) => void;
  mockGet.mockReturnValue(new Promise(done => { finish = done; }));
  const hook = renderHook(() => useFactionSync());
  await waitFor(() => expect(mockGet).toHaveBeenCalled());
  advanceSessionEpoch();
  await act(async () => { finish('frost'); });
  expect(useFactionStore.getState().faction).toBeNull();
  hook.unmount();
});
