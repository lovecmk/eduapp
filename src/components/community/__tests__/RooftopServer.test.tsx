import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
jest.mock('../../../data/network/env', () => ({ env: { useMockData: false } }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
const mockGet = jest.fn();
const mockOpen = jest.fn();
const mockPull = jest.fn();
jest.mock('../../../data/repositories', () => ({ rooftopRepository: { get: (...args: unknown[]) => mockGet(...args), open: (...args: unknown[]) => mockOpen(...args) }, collectionRepository: { pull: () => mockPull() } }));
import { ThemeProvider } from '../../../theme/ThemeProvider';
import { RooftopCrates } from '../RooftopCrates';
import { useCollectionStore, selectPacks } from '../../../store/collectionStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { EMPTY_SNAPSHOT } from '../../../domain/models/Collection';
import { monthKey } from '../../../domain/buildingCrates';
import { advanceSessionEpoch } from '../../../data/network/sessionEpoch';

const month = monthKey();
const receipt = { month, floor: 5, packs: 1, shards: 0, opened_at: new Date().toISOString() };
const state = { month, floors: 5, my_bricks: 1, history: [] };
const wrap = () => render(<ThemeProvider><RooftopCrates month={month} floors={50} accent="#2563EB" /></ThemeProvider>);
beforeEach(() => {
  jest.useFakeTimers();
  useCollectionStore.getState().reset();
  useSettingsStore.setState({ collectionEnabled: true });
  mockGet.mockReset().mockResolvedValue(state);
  mockOpen.mockReset().mockResolvedValue(receipt);
  mockPull.mockReset().mockResolvedValue({ ...EMPTY_SNAPSHOT, rooftopPacks: 1, rooftopShards: 0 });
});
afterEach(() => jest.useRealTimers());
const loaded = async () => { wrap(); await act(async () => {}); };
const open = async () => {
  fireEvent.press(screen.getByLabelText('5층 벽돌 꾸러미, 지금 열 수 있어요'));
  fireEvent.press(screen.getByText('상자 열기'));
  await act(async () => { jest.advanceTimersByTime(600); });
};
it('uses server eligibility, deduplicates taps and applies a confirmed ledger credit', async () => {
  await loaded();
  expect(screen.getByText('🧱 내 벽돌 1장')).toBeTruthy();
  expect(useCollectionStore.getState().openBuildingCrate(month, 50, 50)).toBeNull();
  await open();
  expect(mockOpen).toHaveBeenCalledTimes(1);
  expect(mockOpen).toHaveBeenCalledWith(month, 5);
  expect(screen.getByText('카드팩 +1')).toBeTruthy();
  expect(selectPacks(useCollectionStore.getState())).toBe(4);
});
it('does not grant anything on timeout or offline failure', async () => {
  mockOpen.mockRejectedValue(new Error('timeout'));
  await loaded(); await open();
  expect(selectPacks(useCollectionStore.getState())).toBe(3);
  expect(screen.getByText('상자 열기')).toBeTruthy();
  expect(mockPull).not.toHaveBeenCalled();
});
it('fails closed when API is undeployed and offers retry', async () => {
  mockGet.mockRejectedValue(new Error('503'));
  await loaded();
  expect(screen.getByText('보물상자 다시 확인')).toBeTruthy();
  expect(screen.queryByText('상자 열기')).toBeNull();
  expect(mockOpen).not.toHaveBeenCalled();
});
it('prevents a delayed response from granting the next logged-in account', async () => {
  mockPull.mockImplementation(async () => { advanceSessionEpoch(); return { ...EMPTY_SNAPSHOT, rooftopPacks: 1 }; });
  await loaded(); await open();
  expect(useCollectionStore.getState().rooftopPacks).toBeUndefined();
  expect(selectPacks(useCollectionStore.getState())).toBe(3);
});
