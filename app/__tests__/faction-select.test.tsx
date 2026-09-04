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

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import FactionSelectScreen from '../faction-select';
import { ThemeProvider } from '../../src/theme/ThemeProvider';
import { useSettingsStore, FONT_SCALE_FACTOR, type FontScale } from '../../src/store/settingsStore';
import { FACTION_LIST } from '../../src/constants/factions';

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

function renderAt(scale: FontScale) {
  useSettingsStore.setState({ fontScale: scale } as never);
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>
        <FactionSelectScreen />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
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
