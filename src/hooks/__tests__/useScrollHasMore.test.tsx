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

  /**
   * 발진(oscillation) — 이 훅이 실제로 화면을 망가뜨린 방식.
   *
   * 카드 뒷면의 '다 읽었어요 ✨' 도장이 `!hasMore` 일 때만 렌더돼, 바닥에 닿는
   * 순간 콘텐츠가 20px 늘었다 줄었다 했다. 콘텐츠가 줄면 스크롤 오프셋이
   * 클램프되어 화면이 위로 튄다 — 해설이 위아래로 튀던 증상의 정체다.
   *
   * 도장 쪽은 자리를 늘 차지하도록 고쳤지만, 훅에도 히스테리시스를 둔다.
   * 다음 사람이 같은 함정을 밟아도 발진까지는 가지 않게.
   */
  it('콘텐츠 높이가 ±20px 흔들려도 상태가 발진하지 않는다', () => {
    // 바닥까지 내렸다 — 여기서 도장이 뜨면서 콘텐츠가 20px 늘어난다.
    act(() => { api.scrollProps.onScroll(scrollEvent(500, 400, 900)); });
    expect(api.hasMore).toBe(false);

    const seen: boolean[] = [];
    for (let i = 0; i < 8; i++) {
      // 도장 mount → +20px, unmount → −20px 을 번갈아 흉내 낸다.
      act(() => { api.scrollProps.onContentSizeChange(0, i % 2 === 0 ? 920 : 900); });
      seen.push(api.hasMore);
    }
    // 한 번도 되돌아가지 않는다 — 되돌아가는 순간이 곧 튐이다.
    expect(seen).toEqual(Array(8).fill(false));
    expect(api.overflowing).toBe(true);
  });

  it('진짜로 더 남았을 때는 켜진다 — 히스테리시스가 눈멀지는 않았다', () => {
    act(() => { api.scrollProps.onScroll(scrollEvent(500, 400, 900)); });
    expect(api.hasMore).toBe(false);
    // 20px 로는 안 켜지지만(위), 문턱을 넉넉히 넘으면 켜져야 한다.
    act(() => { api.scrollProps.onContentSizeChange(0, 1100); });
    expect(api.hasMore).toBe(true);
  });

  it('넘침 판정도 경계에서 떨리지 않는다', () => {
    act(() => { api.scrollProps.onLayout(layout(400)); });
    act(() => { api.scrollProps.onContentSizeChange(0, 900); });
    expect(api.overflowing).toBe(true);

    // 경계 근처를 오가는 값 — 한 번 켜졌으면 여기서 꺼지지 않는다.
    act(() => { api.scrollProps.onContentSizeChange(0, 410); });
    expect(api.overflowing).toBe(true);
    // 영역 안으로 완전히 들어오면 그때는 꺼진다.
    act(() => { api.scrollProps.onContentSizeChange(0, 401); });
    expect(api.overflowing).toBe(false);
  });
});
