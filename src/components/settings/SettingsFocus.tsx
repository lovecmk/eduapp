import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { View, ScrollView, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  interpolateColor,
} from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * 설정 항목 "포커스" 시스템 — 검색 결과나 딥링크(`?focus=<id>`)로 들어왔을 때
 * 해당 항목까지 자동으로 스크롤하고 잠깐 하이라이트해 눈에 띄게 한다.
 *
 * 메뉴 depth 를 얕게 유지하면서도 "검색으로 어떤 항목이든 한 번에 도달"을 만드는 핵심 장치.
 *
 * 위치 계산 방식: 중첩된 `MeasureOffset` 이 각자 자기 y 를 재고 부모의 누적값에 더해
 * 내려주므로, 앵커는 (부모 누적 y + 자기 y) = 스크롤 콘텐츠 기준 절대 y 를 알 수 있다.
 * measureLayout 의 플랫폼(웹/네이티브) 편차를 피하려고 onLayout 만으로 구성했다.
 */

// ── 누적 오프셋 ────────────────────────────────────────────────────────
const OffsetCtx = createContext(0);

/**
 * 자기 y 를 재서 부모 누적 오프셋에 더해 자식에게 물려주는 래퍼 View.
 * 포커스 제공자 밖에서도 그냥 평범한 View 처럼 동작한다(부담 없이 중첩 가능).
 */
export function MeasureOffset({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const parent = useContext(OffsetCtx);
  const [y, setY] = useState(0);
  return (
    <OffsetCtx.Provider value={parent + y}>
      <View
        style={style}
        onLayout={(e) => {
          const next = e.nativeEvent.layout.y;
          setY((prev) => (Math.abs(prev - next) > 0.5 ? next : prev));
        }}
      >
        {children}
      </View>
    </OffsetCtx.Provider>
  );
}

// ── 포커스 컨텍스트 ────────────────────────────────────────────────────
interface FocusCtx {
  focusedId: string | null;
  registerAnchor: (id: string, y: number) => void;
  /** 특정 항목으로 스크롤 + 하이라이트. */
  focus: (id: string) => void;
}

const Ctx = createContext<FocusCtx>({
  focusedId: null,
  registerAnchor: () => {},
  focus: () => {},
});

export function useSettingsFocus(): FocusCtx {
  return useContext(Ctx);
}

/**
 * 포커스 제공자 — 스크롤 대상 ScrollView 의 ref 를 받아 자동 스크롤을 수행한다.
 * `initialFocusId`(라우트 파라미터)가 있으면 해당 항목의 레이아웃이 잡히는 즉시 이동한다.
 */
export function SettingsFocusProvider({
  scrollRef,
  initialFocusId,
  offset = 96,
  children,
}: {
  scrollRef: React.RefObject<ScrollView>;
  initialFocusId?: string | null;
  /** 헤더·검색바에 가리지 않도록 스크롤 위치에서 빼줄 여백. */
  offset?: number;
  children: React.ReactNode;
}) {
  const positions = useRef(new Map<string, number>());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingId = useRef<string | null>(initialFocusId ?? null);

  const scrollTo = useCallback((id: string) => {
    const y = positions.current.get(id);
    if (y === undefined) return false;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - offset), animated: true });
    return true;
  }, [offset, scrollRef]);

  const registerAnchor = useCallback((id: string, y: number) => {
    positions.current.set(id, y);
    // 진입 직후에는 아직 레이아웃 전이라 위치를 모른다. 대상이 등록되는 순간 따라간다.
    if (pendingId.current === id) {
      pendingId.current = null;
      requestAnimationFrame(() => scrollTo(id));
    }
  }, [scrollTo]);

  const focus = useCallback((id: string) => {
    setFocusedId(id);
    if (!scrollTo(id)) pendingId.current = id;
    if (clearTimer.current) clearTimeout(clearTimer.current);
    // 하이라이트는 잠깐만 — 계속 남아 있으면 '선택된 상태'로 오해된다.
    clearTimer.current = setTimeout(() => setFocusedId(null), 2400);
  }, [scrollTo]);

  useEffect(() => {
    if (initialFocusId) focus(initialFocusId);
  }, [initialFocusId]);

  useEffect(() => () => {
    if (clearTimer.current) clearTimeout(clearTimer.current);
  }, []);

  const value = useMemo(() => ({ focusedId, registerAnchor, focus }), [focusedId, registerAnchor, focus]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * 앵커 래퍼 — 설정 행/블록을 감싸 위치를 등록하고, 포커스되면 은은히 두 번 반짝인다.
 * 제공자 밖에서 써도 안전하게 그냥 통과 렌더된다.
 */
export function FocusAnchor({ id, children }: { id: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const { focusedId, registerAnchor } = useSettingsFocus();
  const parentOffset = useContext(OffsetCtx);
  const [ownY, setOwnY] = useState<number | null>(null);
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (ownY !== null) registerAnchor(id, parentOffset + ownY);
  }, [id, ownY, parentOffset, registerAnchor]);

  useEffect(() => {
    if (focusedId !== id) return;
    pulse.value = withSequence(
      withTiming(1, { duration: 260 }),
      withTiming(0.35, { duration: 420 }),
      withTiming(1, { duration: 320 }),
      withTiming(0, { duration: 700 }),
    );
  }, [focusedId, id]);

  const style = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(pulse.value, [0, 1], ['rgba(0,0,0,0)', c.primary + '2E']),
  }));

  return (
    <View
      onLayout={(e) => {
        const next = e.nativeEvent.layout.y;
        setOwnY((prev) => (prev === null || Math.abs(prev - next) > 0.5 ? next : prev));
      }}
    >
      <Animated.View style={style}>{children}</Animated.View>
    </View>
  );
}
