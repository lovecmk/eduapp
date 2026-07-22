import React from 'react';
import Svg, { Path, Circle, Rect, G } from 'react-native-svg';

// 앱 로고 — '하루3분ON'.
// 스톱워치(3분 타이머) + 파랑/노랑 두 색의 반복(복습) 링, 그리고 귀여운 미소.
//  · 파랑 호: 왼쪽(시작·집중)
//  · 노랑 호: 오른쪽 + 화살표(반복·복습)
//  · 상단 크라운(스톱워치 버튼) · 가운데 시계바늘 · 은은한 미소
// 브랜드 컬러(파랑·노랑)는 테마와 무관하게 고정한다.
const BLUE = '#3E7BF6';
const YELLOW = '#F7A928';

interface Props {
  size?: number;
}

export function AppLogo({ size = 32 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      {/* 상단 크라운(스톱워치 버튼) */}
      <Rect x={42} y={4} width={16} height={9} rx={4.5} fill={BLUE} />

      {/* 파랑 호 — 왼쪽(11시 → 6시, 9시를 지나며) */}
      <Path d="M35 21 A34 34 0 0 0 46 83.5" stroke={BLUE} strokeWidth={7.5} strokeLinecap="round" fill="none" />
      {/* 왼쪽 눈금(9시) */}
      <Rect x={13.5} y={46.5} width={7} height={7} rx={3.5} fill={BLUE} />

      {/* 노랑 호 — 오른쪽(1시 → 6시, 3시를 지나며) + 반복 화살표 */}
      <Path d="M65 21 A34 34 0 0 1 54 83.5" stroke={YELLOW} strokeWidth={7.5} strokeLinecap="round" fill="none" />
      {/* 오른쪽 눈금(3시) */}
      <Rect x={79.5} y={46.5} width={7} height={7} rx={3.5} fill={YELLOW} />
      {/* 반복 화살표(노랑 호 끝) */}
      <Path d="M65 21 L58 16 M65 21 L70 14" stroke={YELLOW} strokeWidth={6} strokeLinecap="round" fill="none" />
      <Path d="M54 83.5 L61 88 M54 83.5 L49 90" stroke={YELLOW} strokeWidth={6} strokeLinecap="round" fill="none" />

      {/* 얼굴 — 눈 두 개 + 미소 */}
      <G>
        <Circle cx={41} cy={44} r={3.4} fill={BLUE} />
        <Circle cx={59} cy={44} r={3.4} fill={BLUE} />
        <Path d="M43 52 Q50 58 57 52" stroke={BLUE} strokeWidth={3.4} strokeLinecap="round" fill="none" />
      </G>

      {/* 시계바늘 — 가운데 허브 + 노랑 바늘(1~2시 방향) */}
      <Path d="M50 62 L64 44" stroke={YELLOW} strokeWidth={6} strokeLinecap="round" fill="none" />
      <Circle cx={50} cy={62} r={5.5} fill={YELLOW} />
    </Svg>
  );
}
