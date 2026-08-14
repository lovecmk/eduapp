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
 * 쓰는 쪽은 스크롤 영역을 position 기준이 되는 상자로 감싸고, 그 안에
 * ScrollFadeEdge 를 얹으면 된다.
 *
 * ```tsx
 * const body = useScrollHasMore();
 * <View style={{ flex: 1 }}>
 *   <ScrollView {...body.scrollProps}>…</ScrollView>
 *   <ScrollFadeEdge color={surface} visible={body.hasMore} />
 * </View>
 * ```
 */
export function useScrollHasMore() {
  const [hasMore, setHasMore] = useState(false);
  const contentRef = useRef(0);
  const viewportRef = useRef(0);

  const sync = useCallback(() => {
    const content = contentRef.current;
    const viewport = viewportRef.current;
    // 둘 중 하나라도 아직 모르면 판단을 미룬다.
    setHasMore(viewport > 0 && content > viewport + 2);
  }, []);

  const scrollProps = useMemo(
    () => ({
      scrollEventThrottle: 16,
      onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
        setHasMore(contentOffset.y + layoutMeasurement.height < contentSize.height - 2);
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

  return { hasMore, scrollProps };
}
