import { useCallback, useMemo, useRef, useState } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

/**
 * 상태가 꺼지는 문턱(px) — 소수점 오차로 '끝'을 영영 만나지 못하는 것을 막는다.
 */
const OFF_PX = 2;
/**
 * 상태가 다시 켜지는 문턱(px) — 꺼지는 문턱보다 **넉넉히** 크다.
 *
 * 이 간격이 곧 안전 여유다. 스크롤 상태에 따라 콘텐츠 높이가 조금 흔들려도
 * (도장 한 줄이 20px 남짓) 상태가 되돌아가지 못해 고리가 닫히지 않는다.
 */
const ON_PX = 28;

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
 *  · **켜는 문턱과 끄는 문턱이 다르다**(히스테리시스). 아래의 '반드시 지킬 것'을
 *    어긴 화면에서도 상태가 발진하지 않게 막는 안전장치다.
 *
 * ── 반드시 지킬 것: 스크롤 콘텐츠의 높이는 스크롤 상태로부터 계산되면 안 된다 ──
 * 이 훅이 내놓는 값(hasMore·overflowing)으로 **콘텐츠 안에 무언가를 넣었다 뺐다
 * 하면 안 된다.** 그러면 고리가 닫힌다:
 *
 *   바닥 도달 → hasMore=false → '다 읽었어요' 도장 mount → 콘텐츠 +20px
 *            → onContentSizeChange → hasMore=true → 도장 unmount → −20px → …
 *
 * 콘텐츠가 줄어드는 순간 스크롤 오프셋이 클램프되어 화면이 위로 튀고, 다시
 * 늘어나면 내려간다 — 실제로 카드 뒷면 해설이 이렇게 위아래로 튀었다.
 * 스크롤 상태에 따라 보였다 사라지는 것은 (a) 스크롤 영역 **밖**의 오버레이로
 * 두거나, (b) 자리는 늘 차지한 채 opacity 만 바꾼다.
 *
 * 같은 이유로 `scrollEnabled` 를 `overflowing` 으로 켜고 끄지 않는다. 경계에서
 * 스크롤이 순간적으로 꺼지면 진행 중이던 제스처가 끊긴다. `overflowing` 은
 * **보여 주는 것**(막대·가림막·안내)에만 쓴다.
 *
 * 두 가지를 따로 알려 준다.
 *  · `overflowing` — 내용이 영역보다 커서 **스크롤이라는 것이 존재하는가**.
 *    스크롤 막대·레일처럼 **보여 주는 것**을 이것으로 정한다. 넘치지도 않는데
 *    막대를 띄우면 사용자는 있지도 않은 아랫부분을 계속 찾는다.
 *  · `hasMore` — 지금 위치에서 **아래로 더 남았는가**. 가림막(ScrollFadeEdge)의 몫이라
 *    끝까지 내리면 꺼진다.
 *  · `progress` — 0~1 의 스크롤 위치. 직접 그리는 스크롤 막대(CuteScrollRail)가
 *    쓴다. 넘치지 않으면 0 이다 — 그릴 것이 없다는 뜻이다.
 *  · `ratio` — 보이는 높이 / 전체 높이. 막대 손잡이의 길이가 이 비율을 따라야
 *    "얼마나 남았는지"가 눈에 보인다(짧은 손잡이 = 갈 길이 멀다).
 *
 * 쓰는 쪽은 스크롤 영역을 position 기준이 되는 상자로 감싸고, 그 안에
 * ScrollFadeEdge 를 얹으면 된다.
 *
 * ```tsx
 * const body = useScrollHasMore();
 * <View style={{ flex: 1 }}>
 *   <ScrollView showsVerticalScrollIndicator={body.overflowing} {...body.scrollProps}>
 *     …
 *   </ScrollView>
 *   <ScrollFadeEdge color={surface} visible={body.hasMore} />
 * </View>
 * ```
 */
export function useScrollHasMore() {
  const [hasMore, setHasMore] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ratio, setRatio] = useState(1);
  const contentRef = useRef(0);
  const viewportRef = useRef(0);
  const offsetRef = useRef(0);
  // 히스테리시스는 '지금 값'을 알아야 판단할 수 있다. setState 의 함수형 갱신은
  // 두 값을 함께 봐야 하는 이 계산에 쓰기 불편해서 ref 로 따로 들고 있는다.
  const overRef = useRef(false);
  const moreRef = useRef(false);

  /** 지금 값을 기준으로 켜짐/꺼짐을 정한다 — 두 문턱 사이면 그대로 둔다. */
  const settle = (was: boolean, slack: number) =>
    was ? slack > OFF_PX : slack > ON_PX;

  const sync = useCallback(() => {
    const content = contentRef.current;
    const viewport = viewportRef.current;
    // 둘 중 하나라도 아직 모르면 판단을 미룬다.
    const measured = viewport > 0 && content > 0;
    const over = measured && settle(overRef.current, content - viewport);
    overRef.current = over;
    setOverflowing(over);

    const more = over && settle(moreRef.current, content - viewport - offsetRef.current);
    moreRef.current = more;
    setHasMore(more);

    // 스크롤할 수 있는 총 거리로 나눈다. 0 으로 나누는 경우(넘치지 않음)는
    // 위에서 걸러지고, 그때는 그릴 막대 자체가 없으므로 0/1 로 되돌린다.
    if (!over) {
      setProgress(0);
      setRatio(1);
      return;
    }
    const travel = content - viewport;
    // 튕김(bounce)으로 0 아래·1 위로 나가면 손잡이가 레일 밖으로 삐져나간다.
    setProgress(Math.min(1, Math.max(0, offsetRef.current / travel)));
    setRatio(Math.min(1, viewport / content));
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

  return { hasMore, overflowing, progress, ratio, scrollProps };
}
