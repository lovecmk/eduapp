import React, { useEffect, useMemo, useRef } from 'react';
import { View, Animated, Easing, StyleSheet } from 'react-native';
import type { DayPhase } from '../../utils/daylight';
import type { WeatherCondition } from '../../domain/models/Weather';

// ── 홈 배경 앰비언트 효과 ───────────────────────────────────────────────
// '아침/저녁' 같은 라벨을 띄우지 않고, 배경으로만 지금의 시간대·날씨를 은은히 전한다.
//  · 아침  → 따스한 햇살(대각선 광선)
//  · 낮    → 맑고 밝은 하늘 + 옅은 햇무리
//  · 저녁  → 노을빛 글로우
//  · 밤    → 별이 반짝이고 달무리가 은은
//  · 비/눈 → 시간대 위에 빗줄기/눈이 내림
// 모든 요소는 pointerEvents="none" 로 터치를 막지 않으며, 가독성을 해치지 않도록
// 아주 낮은 투명도로만 그린다.

type Props = {
  phase: DayPhase;
  /** 날씨(없으면 맑음으로 간주 — 시간대 효과만). */
  condition?: WeatherCondition;
};

/** 시간대별 배경 톤(상단에서 아래로 옅게 깔리는 하늘색). */
const PHASE_TINT: Record<DayPhase, { sky: string; glow: string }> = {
  morning: { sky: 'rgba(253,186,116,0.14)', glow: 'rgba(253,224,120,0.30)' }, // 아침 햇살
  day: { sky: 'rgba(125,211,252,0.12)', glow: 'rgba(252,211,77,0.22)' }, // 맑은 낮
  evening: { sky: 'rgba(251,146,60,0.16)', glow: 'rgba(251,113,60,0.28)' }, // 노을
  night: { sky: 'rgba(79,70,229,0.14)', glow: 'rgba(165,180,252,0.22)' }, // 밤
};

/** 천천히 0→1→0 을 반복하는 값(숨쉬는 듯한 미세한 효과). */
function useBreath(durationMs: number) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: durationMs, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: durationMs, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, durationMs]);
  return v;
}

/** 대각선 햇살 광선 몇 줄기 — 아침/낮의 맑은 하늘. */
function SunRays({ color }: { color: string }) {
  const breath = useBreath(3600);
  const rays = [
    { top: -40, left: '8%', h: 420, rot: '18deg', w: 26, delay: 0 },
    { top: -60, left: '30%', h: 480, rot: '18deg', w: 40, delay: 0.15 },
    { top: -50, left: '58%', h: 440, rot: '18deg', w: 22, delay: 0.3 },
  ] as const;
  return (
    <>
      {rays.map((r, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            top: r.top,
            left: r.left as never,
            width: r.w,
            height: r.h,
            backgroundColor: color,
            borderRadius: r.w,
            transform: [{ rotate: r.rot }, { scaleY: breath.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.04] }) }],
            opacity: breath.interpolate({ inputRange: [0, 1], outputRange: [0.06 + i * 0.01, 0.12 + i * 0.01] }),
          }}
        />
      ))}
    </>
  );
}

/** 코너의 은은한 햇무리/달무리. */
function GlowOrb({ color, corner }: { color: string; corner: 'right' | 'left' }) {
  const breath = useBreath(3000);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: -70,
        [corner]: -60,
        width: 220,
        height: 220,
        borderRadius: 110,
        backgroundColor: color,
        opacity: breath.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0.85] }),
        transform: [{ scale: breath.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.06] }) }],
      }}
    />
  );
}

/** 밤하늘의 반짝이는 별들. */
function Stars() {
  const seeds = useMemo(
    () =>
      Array.from({ length: 14 }).map((_, i) => ({
        top: `${(i * 53) % 62}%`,
        left: `${(i * 71 + 7) % 92}%`,
        size: 2 + ((i * 7) % 3),
        dur: 1400 + ((i * 240) % 2200),
        delay: (i * 180) % 1600,
      })),
    [],
  );
  return (
    <>
      {seeds.map((s, i) => (
        <Twinkle key={i} {...s} />
      ))}
    </>
  );
}

function Twinkle({ top, left, size, dur, delay }: { top: string; left: string; size: number; dur: number; delay: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: dur, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, dur, delay]);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: top as never,
        left: left as never,
        width: size,
        height: size,
        borderRadius: size,
        backgroundColor: '#fff',
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.7] }),
      }}
    />
  );
}

/** 낙하 파티클(비 또는 눈)을 화면 높이만큼 떨어뜨린다. */
function Precipitation({ kind }: { kind: 'rain' | 'snow' }) {
  const isRain = kind === 'rain';
  const drops = useMemo(
    () =>
      Array.from({ length: isRain ? 40 : 20 }).map((_, i) => ({
        left: `${(i * 23 + 3) % 97}%`,
        len: isRain ? 16 + ((i * 5) % 14) : 4 + ((i * 3) % 3),
        dur: isRain ? 820 + ((i * 130) % 620) : 3600 + ((i * 260) % 2600),
        delay: (i * 120) % 1600,
        drift: isRain ? 0 : ((i % 3) - 1) * 10,
      })),
    [isRain],
  );
  return (
    <>
      {drops.map((d, i) => (
        <Drop key={i} isRain={isRain} {...d} />
      ))}
    </>
  );
}

function Drop({ left, len, dur, delay, drift, isRain }: { left: string; len: number; dur: number; delay: number; drift: number; isRain: boolean }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.linear, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, dur, delay]);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [-30, 900] });
  const translateX = v.interpolate({ inputRange: [0, 1], outputRange: [0, drift] });
  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: 0,
        left: left as never,
        width: isRain ? 2 : len,
        height: isRain ? len : len,
        borderRadius: isRain ? 1 : len,
        backgroundColor: isRain ? 'rgba(120,144,180,0.65)' : 'rgba(255,255,255,0.85)',
        opacity: isRain ? 0.6 : 0.75,
        transform: [{ translateY }, { translateX }],
      }}
    />
  );
}

/**
 * 홈 배경 앰비언트 레이어. 홈 컨텐츠 뒤(z-index 아래)에 절대배치로 깔린다.
 * 가독성을 위해 아주 낮은 투명도만 사용하며 터치를 통과시킨다.
 */
export function AmbientSky({ phase, condition = 'clear' }: Props) {
  const tint = PHASE_TINT[phase];
  const showRain = condition === 'rain' || condition === 'thunderstorm';
  const showSnow = condition === 'snow';
  const clearSky = !showRain && !showSnow && condition !== 'clouds' && condition !== 'mist';

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* 시간대 하늘 톤 — 상단에서 아래로 옅게 */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 260, backgroundColor: tint.sky }} />

      {/* 맑을 때만: 시간대별 해/달 무리와 햇살 */}
      {clearSky && (phase === 'morning' || phase === 'day') && (
        <>
          <GlowOrb color={tint.glow} corner="right" />
          <SunRays color={tint.glow} />
        </>
      )}
      {clearSky && phase === 'evening' && <GlowOrb color={tint.glow} corner="right" />}
      {clearSky && phase === 'night' && (
        <>
          <GlowOrb color={tint.glow} corner="left" />
          <Stars />
        </>
      )}

      {/* 흐림/안개 — 옅은 회색 톤 한 겹 */}
      {(condition === 'clouds' || condition === 'mist') && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 260, backgroundColor: 'rgba(148,163,184,0.10)' }} />
      )}

      {/* 강수 — 시간대 위에 겹쳐 내린다 */}
      {showRain && <Precipitation kind="rain" />}
      {showSnow && <Precipitation kind="snow" />}
    </View>
  );
}
