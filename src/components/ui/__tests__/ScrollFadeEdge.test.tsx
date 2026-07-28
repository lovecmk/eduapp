import React from 'react';
import { render, screen } from '@testing-library/react-native';

import { ScrollFadeEdge } from '../ScrollFadeEdge';

// 이 조각이 하는 일은 하나다: 스크롤이 끝나지 않았을 때만 아래를 옅게 가려
// '더 있다'를 알린다. 끝났는데도 가리면 그건 없는 내용을 있는 척하는 것이다.

describe('ScrollFadeEdge', () => {
  it('더 스크롤할 것이 있으면 가림막을 그린다', () => {
    render(<ScrollFadeEdge color="#fff" visible />);
    expect(screen.UNSAFE_root.findAllByType(ScrollFadeEdge).length).toBe(1);
    // Svg 가 실제로 렌더됐는지(그리지 않으면 잘린 자리가 그대로 보인다).
    expect(screen.UNSAFE_root.findAllByProps({ fill: 'url(#scrollFade)' }).length).toBeGreaterThan(0);
  });

  it('끝까지 내렸으면 아무것도 그리지 않는다', () => {
    render(<ScrollFadeEdge color="#fff" visible={false} />);
    // 남은 것이 없는데 가려 두면 사용자는 계속 아래를 찾게 된다.
    expect(screen.UNSAFE_root.findAllByProps({ fill: 'url(#scrollFade)' }).length).toBe(0);
  });

  it('터치를 가로채지 않는다', () => {
    // 가림막이 터치를 먹으면 마지막 줄의 링크·버튼을 누를 수 없다.
    render(<ScrollFadeEdge color="#fff" visible />);
    const none = screen.UNSAFE_root.findAllByProps({ pointerEvents: 'none' });
    expect(none.length).toBeGreaterThan(0);
  });

  it('배경색을 그대로 써서 이어지는 것처럼 보이게 한다', () => {
    render(<ScrollFadeEdge color="#ABCDEF" visible />);
    const stops = screen.UNSAFE_root.findAllByProps({ stopColor: '#ABCDEF' });
    expect(stops.length).toBeGreaterThan(0);
  });
});
