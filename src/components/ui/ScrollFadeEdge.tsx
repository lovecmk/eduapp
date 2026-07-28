import React from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';

/**
 * 스크롤 영역 아래쪽에 얹는 옅은 그라데이션 — "아래에 더 있다"는 표시.
 *
 * 왜 필요한가: 스크롤 영역이 직선으로 끝나면, 경계에 걸린 요소가 반듯하게
 * 잘려 보인다. 태그 칩처럼 모서리가 둥근 것이 반으로 잘리면 사람은 그것을
 * '스크롤 중'이 아니라 **'화면이 깨졌다'** 로 읽는다(실제로 그렇게 신고됐다).
 *
 * 배경색으로 서서히 흐려지게 하면 잘린 자리가 '가려진 것'이 되고,
 * 자연스럽게 더 있다는 신호가 된다. 화살표나 안내 문구보다 조용하고,
 * 읽는 흐름을 끊지 않는다.
 *
 * 끝까지 내렸을 때는 사라진다 — 남은 것이 없는데 가려 두면 그것도 거짓말이다.
 *
 * react-native-svg 를 쓰는 이유: RN 의 backgroundImage 는 네이티브에서 동작하지
 * 않고, 반투명 View 를 여러 겹 쌓으면 색이 층으로 끊겨 보인다. 이 프로젝트는
 * 이미 도감 카드에서 같은 방식으로 그라데이션을 그린다.
 */
export function ScrollFadeEdge({
  color,
  visible,
  height = 28,
}: {
  /** 스크롤 영역의 배경색 — 이 색으로 흐려진다. */
  color: string;
  /** 아래로 더 스크롤할 수 있는가. */
  visible: boolean;
  height?: number;
}) {
  if (!visible) return null;
  return (
    <View
      // 터치를 가로채면 마지막 줄을 누를 수 없게 된다.
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height }}
    >
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="scrollFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0" />
            <Stop offset="1" stopColor={color} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#scrollFade)" />
      </Svg>
    </View>
  );
}
