import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { ImageSourcePropType } from 'react-native';

import { QuestionImage } from '../QuestionImage';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import { useSettingsStore } from '../../../store/settingsStore';

// NetInfo 는 네이티브 모듈이다 — 연결 종류를 테스트가 직접 정한다.
let mockNetType = 'wifi';
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn((cb: (s: { type: string }) => void) => {
      cb({ type: mockNetType });
      return () => {};
    }),
  },
}));

// 사진이 없을 때 이 조각이 무엇을 하는가 — 그것이 이 화면에서 가장 중요하다.
//
// 이 앱의 현장점검 카드는 문제가 "어떤 문제점이 있을까?" 한 줄이고, 무엇이
// 문제인지는 **사진에만** 들어 있다. 그래서 사진을 못 불러왔을 때 조용히
// 사라지면 학습자에게는 답이 없는 문제가 되고, 운영자에게는 아무 신고도
// 올라오지 않는다(사용자는 원래 그런 카드인 줄 안다).
//
// 예전에는 두 가지가 겹쳐 정확히 그렇게 됐다.
//  · source 가 없으면 스피너가 영원히 돌았다(onLoadEnd 가 올 일이 없다).
//  · 그래서 부르는 쪽들이 '풀린 경우에만' 그리도록 조건을 달았고,
//    못 푼 사진은 칸까지 통째로 사라졌다.

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const tree = (props: { source?: ImageSourcePropType; alt?: string }) => (
  <SafeAreaProvider initialMetrics={metrics}>
    <ThemeProvider>
      <QuestionImage {...props} />
    </ThemeProvider>
  </SafeAreaProvider>
);
const wrap = (props: { source?: ImageSourcePropType; alt?: string }) => render(tree(props));

afterEach(() => {
  mockNetType = 'wifi';
  useSettingsStore.setState({ offlineMode: false });
});

describe('QuestionImage', () => {
  it('그림이 없으면 스피너가 아니라 자리를 남긴다', () => {
    wrap({ source: undefined });
    expect(screen.getByText('이미지를 불러올 수 없어요')).toBeTruthy();
  });

  it('그림이 없을 때 무엇이 있어야 하는지 알려 준다', () => {
    wrap({ source: undefined, alt: '철골 내화페인트 탈락' });
    expect(screen.getByText('철골 내화페인트 탈락')).toBeTruthy();
  });

  it('그림이 없으면 확대 안내를 걸지 않는다(누를 것이 없다)', () => {
    wrap({ source: undefined });
    expect(screen.queryByText('탭하여 크게')).toBeNull();
  });

  it('그림이 있으면 실패 문구를 띄우지 않는다', () => {
    wrap({ source: { uri: 'https://example.com/a.png' } });
    expect(screen.queryByText('이미지를 불러올 수 없어요')).toBeNull();
  });
});

// 학습 화면은 카드를 넘겨도 이 조각을 같은 자리에서 다시 쓴다(key 가 없다).
// 과거 결함: 한 장의 사진이 실패하면 그 상태가 다음 카드로 넘어가, 이후의 사진 문제는
// 불러오려는 시도조차 없이 전부 '불러올 수 없어요'가 됐다.
describe('QuestionImage — 카드가 바뀌면 처음부터 다시 불러온다', () => {
  it('앞 카드의 실패가 다음 카드로 넘어가지 않는다', () => {
    const view = render(tree({ source: { uri: 'https://example.com/a.png' }, alt: '앞 카드' }));
    act(() => { fireEvent(screen.getByLabelText('앞 카드'), 'error', { nativeEvent: { error: 'network' } }); });
    expect(screen.getByText('이미지를 불러올 수 없어요')).toBeTruthy();

    view.rerender(tree({ source: { uri: 'https://example.com/b.png' }, alt: '다음 카드' }));
    expect(screen.queryByText('이미지를 불러올 수 없어요')).toBeNull();
    expect(screen.getByLabelText('다음 카드')).toBeTruthy();
  });
});

// 설정의 '데이터 절약' — 예전에는 스위치만 있고 읽는 곳이 없었다.
describe('QuestionImage — 데이터 절약', () => {
  it('모바일 데이터에서는 원격 사진을 바로 받지 않고, 누르면 받는다', () => {
    mockNetType = 'cellular';
    useSettingsStore.setState({ offlineMode: true });
    wrap({ source: { uri: 'https://example.com/a.png' }, alt: '사진' });
    expect(screen.getByText('데이터 절약 중이에요 · 탭하면 사진을 불러와요')).toBeTruthy();
    expect(screen.queryByLabelText('사진')).toBeNull();

    fireEvent.press(screen.getByLabelText('사진 불러오기'));
    expect(screen.getByLabelText('사진')).toBeTruthy();
  });

  it('Wi-Fi 에서는 데이터 절약을 켜 두어도 바로 받는다', () => {
    mockNetType = 'wifi';
    useSettingsStore.setState({ offlineMode: true });
    wrap({ source: { uri: 'https://example.com/a.png' }, alt: '사진' });
    expect(screen.queryByText('데이터 절약 중이에요 · 탭하면 사진을 불러와요')).toBeNull();
    expect(screen.getByLabelText('사진')).toBeTruthy();
  });

  it('기기에 들어 있는 번들 사진은 모바일 데이터에서도 막지 않는다', () => {
    mockNetType = 'cellular';
    useSettingsStore.setState({ offlineMode: true });
    wrap({ source: 42 as unknown as ImageSourcePropType, alt: '번들' });
    expect(screen.queryByText('데이터 절약 중이에요 · 탭하면 사진을 불러와요')).toBeNull();
  });
});
