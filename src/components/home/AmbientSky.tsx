import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, Animated, Easing, StyleSheet, Dimensions } from 'react-native';
import type { DayPhase } from '../../utils/daylight';
import type { WeatherCondition } from '../../domain/models/Weather';

// ── 전역 날씨/시간대 배경 앰비언트 ───────────────────────────────────────
// 학습카드 화면을 제외한 앱 전체 배경에 은은히 깔린다.
//  · 아침  → 따스한 햇살(대각선 광선) + 햇무리
//  · 낮    → 맑고 밝은 하늘 + 옅은 햇무리
//  · 저녁  → 노을빛 글로우
//  · 밤/새벽 → 별이 반짝이고 달무리가 은은
//  · 비/눈 → 시간대 위에 '귀여운' 빗방울/눈송이가 톡톡 내림
// 모든 요소는 pointerEvents="none" 로 터치를 막지 않으며, 가독성을 해치지 않도록
// 낮은 투명도로만 그린다.

const SCREEN_H = Dimensions.get('window').height;

type Props = {
  phase: DayPhase;
  /** 날씨(없으면 맑음으로 간주 — 시간대 효과만). */
  condition?: WeatherCondition;
};

/** 시간대별 배경 톤(상단에서 아래로 옅게 깔리는 하늘색). */
// base 는 화면 전체에 아주 옅게 깔리는 톤 — 라이트/다크 모두에서 과하지 않도록 낮은 알파.
const PHASE_TINT: Record<DayPhase, { sky: string; glow: string; base: string }> = {
  morning: { sky: 'rgba(253,186,116,0.16)', glow: 'rgba(253,224,120,0.32)', base: 'rgba(253,186,116,0.06)' }, // 아침 햇살
  day: { sky: 'rgba(125,211,252,0.13)', glow: 'rgba(252,211,77,0.24)', base: 'rgba(125,211,252,0.05)' }, // 맑은 낮
  evening: { sky: 'rgba(251,146,60,0.18)', glow: 'rgba(251,113,60,0.30)', base: 'rgba(251,146,60,0.07)' }, // 노을
  night: { sky: 'rgba(79,70,229,0.16)', glow: 'rgba(129,140,248,0.24)', base: 'rgba(99,102,241,0.06)' }, // 밤/새벽
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
    { top: -60, left: '6%', h: 520, rot: '18deg', w: 30 },
    { top: -80, left: '28%', h: 600, rot: '18deg', w: 46 },
    { top: -70, left: '56%', h: 560, rot: '18deg', w: 26 },
    { top: -50, left: '78%', h: 500, rot: '18deg', w: 20 },
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
            opacity: breath.interpolate({ inputRange: [0, 1], outputRange: [0.05 + i * 0.008, 0.11 + i * 0.008] }),
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
        width: 240,
        height: 240,
        borderRadius: 120,
        backgroundColor: color,
        opacity: breath.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0.85] }),
        transform: [{ scale: breath.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.06] }) }],
      }}
    />
  );
}

/** 밤하늘의 반짝이는 별들 — 화면 전체에 흩뿌린다. */
function Stars() {
  const seeds = useMemo(
    () =>
      Array.from({ length: 20 }).map((_, i) => ({
        top: `${(i * 47 + 3) % 94}%`,
        left: `${(i * 71 + 7) % 93}%`,
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

/** 낙하 파티클(비 또는 눈)을 화면 높이만큼 떨어뜨린다 — 귀엽게. */
function Precipitation({ kind }: { kind: 'rain' | 'snow' }) {
  const isRain = kind === 'rain';
  const drops = useMemo(
    () =>
      Array.from({ length: isRain ? 34 : 22 }).map((_, i) => ({
        left: `${(i * 23 + 3) % 97}%`,
        size: isRain ? 7 + ((i * 3) % 4) : 6 + ((i * 5) % 7), // 방울/눈송이 크기
        dur: isRain ? 1100 + ((i * 130) % 700) : 4200 + ((i * 260) % 3200),
        delay: (i * 140) % 2000,
        drift: isRain ? ((i % 2) - 0.5) * 8 : ((i % 3) - 1) * 22, // 눈은 좌우로 살랑
        flake: i % 3 === 0, // 일부 눈은 ❄ 모양으로
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

function Drop({ left, size, dur, delay, drift, isRain, flake }: { left: string; size: number; dur: number; delay: number; drift: number; isRain: boolean; flake: boolean }) {
  const v = useRef(new Animated.Value(0)).current;
  const sway = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.linear, useNativeDriver: true }),
      ]),
    );
    loop.start();
    // 눈송이는 좌우로 살랑살랑(귀여운 흔들림).
    let swayLoop: Animated.CompositeAnimation | undefined;
    if (!isRain) {
      swayLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(sway, { toValue: 1, duration: dur / 3, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(sway, { toValue: 0, duration: dur / 3, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      );
      swayLoop.start();
    }
    return () => { loop.stop(); swayLoop?.stop(); };
  }, [v, sway, dur, delay, isRain]);

  const travel = SCREEN_H + 60;
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [-40, travel] });
  const translateX = isRain
    ? v.interpolate({ inputRange: [0, 1], outputRange: [0, drift] })
    : sway.interpolate({ inputRange: [0, 1], outputRange: [-drift, drift] });

  if (isRain) {
    // 귀여운 빗방울 — 둥근 물방울(아래가 통통).
    return (
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          left: left as never,
          width: size,
          height: size * 1.25,
          borderRadius: size,
          borderTopLeftRadius: size * 0.5,
          borderTopRightRadius: size * 0.5,
          backgroundColor: 'rgba(96,165,250,0.55)',
          opacity: 0.7,
          transform: [{ translateY }, { translateX }],
        }}
      />
    );
  }
  // 귀여운 눈 — 일부는 ❄, 나머지는 폭신한 눈송이.
  // 흰 배경에서도 보이도록 옅은 하늘색 톤(다크에서도 자연스럽다).
  if (flake) {
    return (
      <Animated.Text
        style={{
          position: 'absolute',
          top: -40,
          left: left as never,
          fontSize: size + 5,
          color: 'rgba(129,190,247,0.9)',
          opacity: 0.9,
          transform: [{ translateY }, { translateX }],
        }}
      >
        ❄
      </Animated.Text>
    );
  }
  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: 0,
        left: left as never,
        width: size,
        height: size,
        borderRadius: size,
        backgroundColor: 'rgba(191,219,254,0.95)',
        borderWidth: 1,
        borderColor: 'rgba(147,197,253,0.7)',
        opacity: 0.9,
        transform: [{ translateY }, { translateX }],
      }}
    />
  );
}

/**
 * 전역 날씨/시간대 배경 앰비언트 레이어. 화면 전체를 채우며 컨텐츠 뒤(z 아래)에 깔린다.
 * 가독성을 위해 낮은 투명도만 사용하며 터치를 통과시킨다.
 */
export function AmbientSky({ phase, condition = 'clear' }: Props) {
  const tint = PHASE_TINT[phase];
  const showRain = condition === 'rain' || condition === 'thunderstorm';
  const showSnow = condition === 'snow';
  const clearSky = !showRain && !showSnow && condition !== 'clouds' && condition !== 'mist';

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* 전체 베이스 톤 — 아주 옅게 시간대 색을 입혀 화면 전체가 '하늘 아래' 느낌 */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: tint.base }]} />
      {/* 상단 하늘 톤 — 위에서 아래로 옅게(빛은 위에서 온다) */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 320, backgroundColor: tint.sky }} />

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
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 320, backgroundColor: 'rgba(148,163,184,0.10)' }} />
      )}

      {/* 강수 — 시간대 위에 겹쳐 내린다(귀엽게) */}
      {showRain && <Precipitation kind="rain" />}
      {showSnow && <Precipitation kind="snow" />}
    </View>
  );
}
