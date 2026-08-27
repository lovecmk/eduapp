import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { ImageSourcePropType } from 'react-native';

import { QuestionImage } from '../QuestionImage';
import { ThemeProvider } from '../../../theme/ThemeProvider';

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

const wrap = (props: { source?: ImageSourcePropType; alt?: string }) =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>
        <QuestionImage {...props} />
      </ThemeProvider>
    </SafeAreaProvider>,
  );

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
