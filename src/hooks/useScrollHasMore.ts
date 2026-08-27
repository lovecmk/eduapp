import { useCallback, useMemo, useRef, useState } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

/**
 * 스크롤 영역이 '아래에 아직 더 있는가'를 알려 준다 — ScrollFadeEdge 의 짝.
 *
 * 왜 훅으로 빼는가: 판단 규칙이 보기보다 까다로워서, 화면마다 다시 쓰면 그때마다
 * 같은 함정을 밟는다.
 *
 *  · 내용 높이(onContentSizeChange)와 보이는 높이(onLayout)는 **순서가 정해져 있지
 *    않다.** 내용 높이만 보고 판단하면(높이 > 0 이면 더 있다) 스크롤할 것이 없는데도
 *    가림막이 떠서, 사용자는 있지도 않은 아랫부분을 계속 찾게 된다. 그래서 둘 다
 *    들어오기 전에는 판단을 미룬다(기본은 '없음').
 *  · 2px 의 여유를 둔다 — 소수점 오차 때문에 '끝'을 영영 만나지 못하는 것을 막는다.
 *
 * 두 가지를 따로 알려 준다.
 *  · `overflowing` — 내용이 영역보다 커서 **스크롤이라는 것이 존재하는가**.
 *    스크롤 막대(showsVerticalScrollIndicator/persistentScrollbar)와 scrollEnabled 는
 *    이것으로 정한다. 넘치지도 않는데 막대를 띄우면 사용자는 있지도 않은 아랫부분을
 *    찾고, scrollEnabled 를 켜 두면 스크롤될 것이 없는 영역이 손가락만 삼킨다.
 *  · `hasMore` — 지금 위치에서 **아래로 더 남았는가**. 가림막(ScrollFadeEdge)의 몫이라
 *    끝까지 내리면 꺼진다.
 *
 * 쓰는 쪽은 스크롤 영역을 position 기준이 되는 상자로 감싸고, 그 안에
 * ScrollFadeEdge 를 얹으면 된다.
 *
 * ```tsx
 * const body = useScrollHasMore();
 * <View style={{ flex: 1 }}>
 *   <ScrollView
 *     scrollEnabled={body.overflowing}
 *     showsVerticalScrollIndicator={body.overflowing}
 *     {...body.scrollProps}
 *   >…</ScrollView>
 *   <ScrollFadeEdge color={surface} visible={body.hasMore} />
 * </View>
 * ```
 */
export function useScrollHasMore() {
  const [hasMore, setHasMore] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const contentRef = useRef(0);
  const viewportRef = useRef(0);
  const offsetRef = useRef(0);

  const sync = useCallback(() => {
    const content = contentRef.current;
    const viewport = viewportRef.current;
    // 둘 중 하나라도 아직 모르면 판단을 미룬다.
    const over = viewport > 0 && content > viewport + 2;
    setOverflowing(over);
    setHasMore(over && offsetRef.current + viewport < content - 2);
  }, []);

  const scrollProps = useMemo(
    () => ({
      scrollEventThrottle: 16,
      onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
        offsetRef.current = contentOffset.y;
        contentRef.current = contentSize.height;
        viewportRef.current = layoutMeasurement.height;
        sync();
      },
      onContentSizeChange: (_w: number, h: number) => {
        contentRef.current = h;
        sync();
      },
      onLayout: (e: LayoutChangeEvent) => {
        viewportRef.current = e.nativeEvent.layout.height;
        sync();
      },
    }),
    [sync],
  );

  return { hasMore, overflowing, scrollProps };
}
