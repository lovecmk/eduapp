import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import { RooftopCrates } from '../RooftopCrates';
import { useCollectionStore, selectPacks, selectShards } from '../../../store/collectionStore';
import { useSrsStore } from '../../../store/srsStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { crateKey, monthKey } from '../../../domain/buildingCrates';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const store = () => useCollectionStore.getState();
const M = monthKey();
const wrap = (floors: number) => render(<ThemeProvider><RooftopCrates month={M} floors={floors} accent="#2563EB" /></ThemeProvider>);

beforeEach(() => {
  store().reset();
  useSrsStore.setState({ cards: {} });
  useSettingsStore.setState({ collectionEnabled: true });
  mockPush.mockClear();
});

describe('openBuildingCrate — 스토어가 다시 판정한다', () => {
  it('층과 벽돌이 모두 되면 팩·조각을 주고, 같은 상자는 두 번 열리지 않는다', () => {
    store().addStudyProgress(5);
    const packs = selectPacks(store());
    const shards = selectShards(store());
    expect(store().openBuildingCrate(M, 10, 12)).toEqual({ packs: 1, shards: 30 });
    expect(selectPacks(store())).toBe(packs + 1);
    expect(selectShards(store())).toBe(shards + 30);
    expect(store().claimedRules[crateKey(M, 10)]).toBe(1);
    expect(store().openBuildingCrate(M, 10, 12)).toBeNull();
  });

  it('층이 모자라거나, 벽돌이 모자라거나, 모르는 층·지난 달이면 주지 않는다', () => {
    store().addStudyProgress(4);
    const before = store().packsEarned;
    expect(store().openBuildingCrate(M, 10, 9)).toBeNull(); // 9층
    expect(store().openBuildingCrate(M, 10, 12)).toBeNull(); // 벽돌 4 < 5
    expect(store().openBuildingCrate(M, 7, 12)).toBeNull(); // 상자 없는 층
    expect(store().openBuildingCrate('1999-01', 5, 12)).toBeNull(); // 지난 달
    expect(store().packsEarned).toBe(before);
  });

  it('다른 기기에서 연 기록(서버 병합)이 오면 이 기기에서도 열 수 없다', () => {
    store().addStudyProgress(1);
    store().applyServer({ ...store().snapshot(), claimedRules: { [crateKey(M, 5)]: 1 } });
    expect(store().openBuildingCrate(M, 5, 6)).toBeNull();
  });

  it('깜짝 상자는 굴린 결과만큼', () => {
    store().addStudyProgress(10);
    expect(store().openBuildingCrate(M, 20, 20, () => 0.95)).toEqual({ packs: 3, shards: 0 });
  });

  it('이번 달 복습 기록도 벽돌로 인정한다(새 기기·기능 도입 전 학습)', () => {
    const now = Date.now();
    useSrsStore.setState({
      cards: Object.fromEntries(
        Array.from({ length: 5 }, (_, i) => [`c${i}`, { box: 1, dueAt: now, reps: 1, lapses: 0, lastGrade: 'good', lastReviewedAt: now }]),
      ) as never,
    });
    expect(store().bricksFor(M)).toBe(5);
    expect(store().openBuildingCrate(M, 10, 10)).not.toBeNull();
  });
});

describe('RooftopCrates 화면', () => {
  it('열 수 있는 상자 수와 내 벽돌을 보여 주고, 눌러서 열면 보상이 드러난다', () => {
    jest.useFakeTimers();
    try {
      store().addStudyProgress(5);
      wrap(12);
      expect(screen.getByText('🧱 내 벽돌 5장')).toBeTruthy();
      expect(screen.getByText('열 수 있는 상자 2개! 눌러서 열어 보세요')).toBeTruthy();

      fireEvent.press(screen.getByLabelText('10층 빌더 안전모 상자, 지금 열 수 있어요'));
      fireEvent.press(screen.getByText('상자 열기'));
      act(() => { jest.advanceTimersByTime(600); });
      expect(screen.getByText('카드팩 +1 · 안전 조각 +30')).toBeTruthy();

      fireEvent.press(screen.getByText('카드팩 열러 가기'));
      expect(mockPush).toHaveBeenCalledWith('/collection-book');
      expect(screen.getByText('열 수 있는 상자 1개! 눌러서 열어 보세요')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('벽돌이 모자라면 몇 장 더 필요한지 말해 준다', () => {
    store().addStudyProgress(2);
    store().openBuildingCrate(M, 5, 12);
    wrap(12);
    expect(screen.getByText('벽돌 3장 더 올리면 ⛑️ 빌더 안전모 상자가 열려요')).toBeTruthy();
  });

  it('잠긴 상자는 남은 층수를 말하고 열 수 없다', () => {
    wrap(3);
    expect(screen.getByText('다음 상자 🧱 벽돌 꾸러미 · 2층 남음')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('5층 벽돌 꾸러미, 2층 남았어요'));
    expect(screen.getByText('2층 더 올라가야 해요')).toBeTruthy();
    expect(screen.queryByText('상자 열기')).toBeNull();
  });

  it('수집을 끈 사람에게도 상자는 보이고, 켜고 바로 열 수 있다', () => {
    jest.useFakeTimers();
    try {
      useSettingsStore.setState({ collectionEnabled: false });
      store().addStudyProgress(1);
      wrap(6);
      expect(screen.getByText('옥상 보물상자')).toBeTruthy();
      expect(screen.getByText('카드 수집(베타)을 켜면 상자를 열 수 있어요')).toBeTruthy();

      fireEvent.press(screen.getByLabelText('5층 벽돌 꾸러미, 지금 열 수 있어요'));
      fireEvent.press(screen.getByText('카드 수집 켜고 열기'));
      act(() => { jest.advanceTimersByTime(600); });
      expect(useSettingsStore.getState().collectionEnabled).toBe(true);
      expect(screen.getByText('카드팩 +1')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('힌트 줄의 켜기로 카드 수집을 켠다', () => {
    useSettingsStore.setState({ collectionEnabled: false });
    wrap(3);
    fireEvent.press(screen.getByLabelText('카드 수집 켜기'));
    expect(useSettingsStore.getState().collectionEnabled).toBe(true);
    expect(screen.getByText('다음 상자 🧱 벽돌 꾸러미 · 2층 남음')).toBeTruthy();
  });
});
