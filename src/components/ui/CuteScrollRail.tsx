import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  FadeIn,
  FadeOut,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeProvider';
import { fontCute } from '../../theme/tokens';

/**
 * 학습카드 뒷면의 스크롤 표시 — 기본 스크롤 막대를 대신한다.
 *
 * ── 왜 바꾸는가 ───────────────────────────────────────────────────────────
 * 뒷면 해설은 카드 **안에서** 끌어 내려 읽는다. 그런데 OS 기본 스크롤 막대는
 * 손을 뗀 뒤 사라지거나(iOS) 회색 직선으로 남아(Android), 둥근 카드 안에서
 * 혼자 각져 보였다. persistentScrollbar 로 계속 띄워 두면 이번엔 그 회색 선이
 * 카드 모서리를 가르며 남는다.
 *
 * 여기서는 카드 안쪽에 어울리는 **동그란 알약 손잡이**를 직접 그린다.
 *  · 손잡이 길이가 남은 분량을 말해 준다(짧을수록 갈 길이 멀다).
 *  · 끝까지 내리면 레일이 통째로 사라진다 — 다 읽었는데 막대가 남아 있으면
 *    아직 뭔가 있는 줄 알고 계속 밀어 보게 된다.
 *
 * 넘치지 않는 짧은 해설에는 아무것도 그리지 않는다(`visible=false`).
 */
export function CuteScrollRail({
  visible,
  progress,
  ratio,
  color,
  top = 2,
  bottom = 22,
}: {
  /** 내용이 넘쳐 스크롤이 존재하는가. */
  visible: boolean;
  /** 0~1 스크롤 위치. */
  progress: number;
  /** 보이는 높이 / 전체 높이 — 손잡이 길이 비율. */
  ratio: number;
  /** 손잡이 색(카드 강조색). */
  color: string;
  top?: number;
  /** 아래 여백 — 가림막(ScrollFadeEdge)과 겹치지 않게 띄운다. */
  bottom?: number;
}) {
  if (!visible) return null;

  // 손잡이가 너무 짧으면 점처럼 보여 무엇인지 알 수 없다. 최소 18% 는 준다.
  const thumbPct = Math.max(18, Math.min(100, ratio * 100));
  // 손잡이가 레일 안에서 움직일 수 있는 범위는 (100 - 손잡이 길이)% 다.
  const topPct = (100 - thumbPct) * progress;

  return (
    <View pointerEvents="none" style={[styles.rail, { top, bottom }]}>
      <View style={[styles.track, { backgroundColor: color + '1F' }]} />
      <View
        style={[
          styles.thumb,
          { backgroundColor: color, height: `${thumbPct}%`, top: `${topPct}%` },
        ]}
      />
    </View>
  );
}

/**
 * "아래로 더 있어요" 안내 — 가림막 위에서 살짝 통통 튄다.
 *
 * 가림막(ScrollFadeEdge)만으로는 '가려졌다'까지는 보여도 **끌어 내리면 된다**는
 * 것까지는 말해 주지 못한다. 실제로 뒷면을 탭해서 카드를 뒤집어 버리고 해설을
 * 못 읽는 경우가 있었다. 움직이는 화살표 하나가 그 자리를 메운다.
 *
 * 끝까지 내리면 사라진다(`visible=false`). 터치는 가로채지 않는다 —
 * 안내가 마지막 줄을 덮어 누르지 못하게 되면 안내가 아니라 방해다.
 */
export function ScrollMoreHint({ visible, color }: { visible: boolean; color: string }) {
  const bob = useSharedValue(0);
  useEffect(() => {
    bob.value = withRepeat(
      withSequence(
        withTiming(-3.5, { duration: 620, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 620, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }] }));

  if (!visible) return null;
  return (
    <Animated.View
      pointerEvents="none"
      entering={FadeIn.duration(260)}
      exiting={FadeOut.duration(160)}
      style={[styles.hintWrap, style]}
    >
      <View style={[styles.hint, { backgroundColor: color }]}>
        <Text style={styles.hintText}>더 있어요 👇</Text>
      </View>
    </Animated.View>
  );
}

/**
 * 끝까지 읽었을 때 뜨는 도장 — "다 읽었어요 ✨".
 *
 * 해설이 길면 다 읽고도 "이게 끝인가" 싶어 한 번 더 끌어 보게 된다. 끝이라는
 * 사실을 짧게 말해 주면 그 한 번이 사라지고, 다음 동작(뒤집기·채점)으로 넘어간다.
 *
 * ── 자리는 늘 차지한다 ─────────────────────────────────────────────────────
 * 이 도장은 스크롤 **콘텐츠 안**에 산다. 안 보일 때 `return null` 로 사라지면
 * 콘텐츠 높이가 20px 남짓 줄었다 늘었다 하는데, 그 높이는 '다 읽었는가'를
 * 판단하는 바로 그 값이다. 고리가 닫힌다:
 *
 *   바닥 도달 → 도장 mount → 콘텐츠 +20px → 아직 더 있음 → 도장 unmount → …
 *
 * 콘텐츠가 줄어드는 순간 스크롤 오프셋이 클램프되어 화면이 위로 튀고, 다시
 * 늘어나면 내려간다 — 해설이 위아래로 튀던 증상의 정체다.
 *
 * 그래서 **높이는 스크롤 상태와 무관하게 고정**하고 opacity 만 바꾼다. 자리는
 * 늘 비어 있고(글 끝의 여백으로 읽힌다), 다 읽으면 그 자리에 글자가 떠오른다.
 */
export function ScrollEndStamp({ visible, color }: { visible: boolean; color: string }) {
  const shown = useSharedValue(0);
  const pop = useSharedValue(0.6);
  useEffect(() => {
    shown.value = withTiming(visible ? 1 : 0, { duration: visible ? 240 : 140 });
    if (visible) pop.value = withSpring(1, { damping: 9, stiffness: 180 });
    else pop.value = 0.6;
  }, [visible]);
  const style = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ scale: pop.value }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.stampWrap, style]}>
      <Text style={[styles.stampText, { color }]}>다 읽었어요 ✨</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  rail: { position: 'absolute', right: 1, width: 4 },
  track: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 2 },
  thumb: { position: 'absolute', left: 0, right: 0, borderRadius: 2, minHeight: 14 },
  hintWrap: { position: 'absolute', left: 0, right: 0, bottom: 6, alignItems: 'center' },
  hint: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  hintText: { color: '#fff', fontSize: 10.5, fontFamily: fontCute, fontWeight: '700' },
  stampWrap: { alignItems: 'center', paddingTop: 4, paddingBottom: 2 },
  stampText: { fontSize: 11.5, fontFamily: fontCute, fontWeight: '700', opacity: 0.75 },
});
