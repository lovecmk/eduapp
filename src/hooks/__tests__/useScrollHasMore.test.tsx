import React from 'react';
import { Text } from 'react-native';
import { render, act } from '@testing-library/react-native';
import { useScrollHasMore } from '../useScrollHasMore';

/**
 * 스크롤 판정 — "넘치는가(overflowing)"와 "아래로 더 남았는가(hasMore)"는 다르다.
 *
 * 이 구분이 무너지면 화면에서 두 가지가 동시에 어긋난다. 넘치지도 않는 짧은 본문에
 * 스크롤 막대가 붙어 사용자가 있지도 않은 아랫부분을 찾게 되고, 스크롤될 것이 없는
 * 영역이 손가락을 삼켜 탭(카드 뒤집기)이 먹히지 않는다.
 */
describe('useScrollHasMore', () => {
  let api: ReturnType<typeof useScrollHasMore>;

  function Probe() {
    api = useScrollHasMore();
    return <Text>probe</Text>;
  }

  const scrollEvent = (offsetY: number, viewport: number, content: number) =>
    ({ nativeEvent: { contentOffset: { y: offsetY }, layoutMeasurement: { height: viewport }, contentSize: { height: content } } }) as never;

  const layout = (height: number) => ({ nativeEvent: { layout: { height } } }) as never;

  beforeEach(() => { render(<Probe />); });

  it('높이를 하나만 알 때는 판단을 미룬다(먼저 온 쪽만 보고 막대를 띄우지 않는다)', () => {
    act(() => { api.scrollProps.onContentSizeChange(0, 900); });
    expect(api.overflowing).toBe(false);
    expect(api.hasMore).toBe(false);
  });

  it('내용이 영역 안에 들어오면 넘치지 않는다 — 막대도 스크롤도 없다', () => {
    act(() => { api.scrollProps.onContentSizeChange(0, 300); });
    act(() => { api.scrollProps.onLayout(layout(400)); });
    expect(api.overflowing).toBe(false);
    expect(api.hasMore).toBe(false);
  });

  it('내용이 영역을 넘으면 넘침이자 더 있음이다', () => {
    act(() => { api.scrollProps.onContentSizeChange(0, 900); });
    act(() => { api.scrollProps.onLayout(layout(400)); });
    expect(api.overflowing).toBe(true);
    expect(api.hasMore).toBe(true);
  });

  it('끝까지 내리면 더 있음만 꺼지고 넘침은 유지된다(막대는 그대로 남는다)', () => {
    act(() => { api.scrollProps.onScroll(scrollEvent(500, 400, 900)); });
    expect(api.overflowing).toBe(true);
    expect(api.hasMore).toBe(false);

    act(() => { api.scrollProps.onScroll(scrollEvent(0, 400, 900)); });
    expect(api.hasMore).toBe(true);
  });

  it('내용이 줄어 영역 안에 들어오면 남아 있던 판정이 함께 걷힌다', () => {
    act(() => { api.scrollProps.onContentSizeChange(0, 900); });
    act(() => { api.scrollProps.onLayout(layout(400)); });
    expect(api.overflowing).toBe(true);

    act(() => { api.scrollProps.onContentSizeChange(0, 380); });
    expect(api.overflowing).toBe(false);
    expect(api.hasMore).toBe(false);
  });
});
