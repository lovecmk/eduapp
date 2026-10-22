// 진영 선택(온보딩) — 글자 크기 설정이 실제로 닿는지에 대한 회귀 테스트.
//
// 과거 결함: 이 화면의 모든 글자가 배율 없는 상수 크기(17 · 13 · 12.5 …)로 적혀
// 있었다. ThemeProvider 는 설정의 글자 크기를 fontScale 로 내려 주고 앱의 다른
// 화면은 전부 그 값을 곱해 쓰는데, 여기만 useTheme() 에서 theme 만 꺼내 썼다.
// 그래서 '아주 크게'로 두면 Button(내부에서 fontScale 을 읽는다)만 커지고
// 제목·설명·진영 이름은 그대로여서, 온보딩 첫 화면부터 배율이 어긋나 보였다.
//
// 화면이 아니라 '경로'를 고정한다 — 어떤 글자든 배율을 곱하고 있는지만 본다.

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false }),
}));
jest.mock('../../store/authStore', () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'onboarding-user' } }) }));

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import FactionSelectScreen from '../../../app/faction-select';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { useSettingsStore, FONT_SCALE_FACTOR, type FontScale } from '../../store/settingsStore';
import { FACTION_LIST } from '../../constants/factions';
import { EXPERIENCE_OPTIONS } from '../../constants/experience';
import { useFactionStore } from '../../store/factionStore';
import { useAccountRestoreStore } from '../../store/accountRestoreStore';
import { getSessionEpoch } from '../../data/network/sessionEpoch';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

/** 특정 글자의 실제 렌더 fontSize — 배열/중첩 style 도 평탄화해서 읽는다. */
function fontSizeOf(text: string): number | undefined {
  const flat = ([] as unknown[]).concat(
    ...[screen.getByText(text).props.style].flat(Infinity as unknown as number),
  );
  for (const layer of flat.reverse()) {
    const size = (layer as { fontSize?: number } | null | undefined)?.fontSize;
    if (typeof size === 'number') return size;
  }
  return undefined;
}

function renderAt(scale: FontScale, showFaction = true) {
  useFactionStore.setState({ faction: null });
  useAccountRestoreStore.setState({ entries: { faction: { userId: 'onboarding-user', epoch: getSessionEpoch(), status: 'ready' } } });
  useSettingsStore.setState({ fontScale: scale } as never);
  const result = render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>
        <FactionSelectScreen />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  if (showFaction) {
    fireEvent.press(screen.getByRole('radio', { name: EXPERIENCE_OPTIONS[0].title }));
    fireEvent.press(screen.getByRole('button', { name: '다음 · 진영 선택' }));
  }
  return result;
}

describe('진영 선택 — 글자 크기 설정 반영', () => {
  afterEach(() => {
    // 화면이 붙어 있는 채로 스토어를 건드리면 act() 밖 갱신이 된다 — 먼저 걷어낸다.
    screen.unmount();
    useSettingsStore.setState({ fontScale: 'medium' } as never);
  });

  it('제목과 진영 이름이 설정한 배율만큼 커진다', () => {
    const first = FACTION_LIST[0]!;

    renderAt('medium');
    const titleBase = fontSizeOf('진영을 선택하세요');
    const nameBase = fontSizeOf(first.name);
    expect(titleBase).toBeGreaterThan(0);
    expect(nameBase).toBeGreaterThan(0);

    screen.unmount();

    renderAt('xlarge');
    const ratio = FONT_SCALE_FACTOR.xlarge / FONT_SCALE_FACTOR.medium;
    expect(fontSizeOf('진영을 선택하세요')).toBeCloseTo(titleBase! * ratio, 5);
    expect(fontSizeOf(first.name)).toBeCloseTo(nameBase! * ratio, 5);
  });

  it('가장 작은 배율에서는 작아진다(한 방향으로만 통과하는 헛검사 방지)', () => {
    renderAt('medium');
    const base = fontSizeOf('진영을 선택하세요')!;
    screen.unmount();

    renderAt('xsmall');
    expect(fontSizeOf('진영을 선택하세요')).toBeCloseTo(
      base * (FONT_SCALE_FACTOR.xsmall / FONT_SCALE_FACTOR.medium),
      5,
    );
  });
});

describe('경력 확인 후 진영 선택', () => {
  beforeEach(() => useSettingsStore.setState({ experience: '', job: '안전점검', interests: ['전기시설'], accountUpdatedAt: 0 }));
  afterEach(() => { screen.unmount(); useSettingsStore.setState({ experience: '', fontScale: 'medium' }); });

  it('먼저 네 경력 구간을 표시하고, 선택 전에는 다음 단계로 진행할 수 없다', () => {
    renderAt('medium', false);
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(screen.queryByText('진영을 선택하세요')).toBeNull();
    expect(screen.getByRole('button', { name: '다음 · 진영 선택', disabled: true })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '다음 · 진영 선택' }));
    expect(screen.getByText('경력을 알려주세요')).toBeTruthy();
  });

  it.each(EXPERIENCE_OPTIONS)('$value 선택을 계정 설정에 저장하고 직무·관심분야를 보존한다', option => {
    renderAt('medium', false);
    fireEvent.press(screen.getByRole('radio', { name: option.title }));
    // Choosing an option is a preview until the user continues.
    expect(useSettingsStore.getState().experience).toBe('');
    fireEvent.press(screen.getByRole('button', { name: '다음 · 진영 선택' }));
    expect(screen.getByText('진영을 선택하세요')).toBeTruthy();
    expect(useSettingsStore.getState()).toMatchObject({ experience: option.value, job: '안전점검', interests: ['전기시설'] });
    expect(useSettingsStore.getState().accountUpdatedAt).toBeGreaterThan(0);
    fireEvent.press(screen.getByText('시작하기 · 2 / 2 · 경력 다시 선택'));
    expect(screen.getByRole('radio', { name: option.title }).props.accessibilityState.checked).toBe(true);
  });

  it('구버전 경력은 임의로 새 구간에 넣지 않고 그대로 계속할 수 있다', () => {
    useSettingsStore.setState({ experience: '5년 이상' });
    renderAt('medium', false);
    expect(screen.getByText(/기존 선택: 5년 이상/)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '다음 · 진영 선택' }));
    expect(useSettingsStore.getState().experience).toBe('5년 이상');
    expect(screen.getByText('진영을 선택하세요')).toBeTruthy();
  });

  it('늦게 복원된 서버값은 반영하되 사용자가 고르는 중이면 덮어쓰지 않는다', () => {
    renderAt('medium', false);
    act(() => useSettingsStore.setState({ experience: EXPERIENCE_OPTIONS[1].value }));
    expect(screen.getByRole('radio', { name: EXPERIENCE_OPTIONS[1].title }).props.accessibilityState.checked).toBe(true);
    fireEvent.press(screen.getByRole('radio', { name: EXPERIENCE_OPTIONS[2].title }));
    act(() => useSettingsStore.setState({ experience: EXPERIENCE_OPTIONS[0].value }));
    fireEvent.press(screen.getByRole('button', { name: '다음 · 진영 선택' }));
    expect(useSettingsStore.getState().experience).toBe(EXPERIENCE_OPTIONS[2].value);
  });

  it('경력 화면도 설정된 글자 크기를 적용한다', () => {
    renderAt('medium', false);
    const base = fontSizeOf('경력을 알려주세요')!;
    screen.unmount();
    renderAt('xlarge', false);
    expect(fontSizeOf('경력을 알려주세요')).toBeCloseTo(base * FONT_SCALE_FACTOR.xlarge / FONT_SCALE_FACTOR.medium, 5);
  });
});
