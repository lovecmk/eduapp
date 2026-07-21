import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Dimensions } from 'react-native';
import type { AmbientEffect } from '../../constants/ambient';

// ── 전역 배경 앰비언트 테마 ────────────────────────────────────────────────
// 배경은 '흰색(앱 기본)' 그대로 두고, 선택한 테마 효과만 아주 잔잔하게 얹는다.
//  · rain  → 옅은 빗줄기가 바람에 비스듬히 톡톡 내림
//  · snow  → 폭신한 눈송이가 바람에 살랑살랑 내림
//  · stars → 은은한 별들이 반짝반짝(흰 배경에서도 보이게 금·보라 톤)
//  · wind  → 나뭇잎이 바람에 가로로 살랑살랑 날림 + 옅은 바람결
//  · none  → 아무것도 그리지 않음(깔끔한 흰 배경)
// 모든 요소는 pointerEvents="none" 로 터치를 막지 않으며, 가독성을 해치지 않도록
// 낮은 투명도로만, 적은 개수로 아주 잔잔하게 그린다.

const SCREEN_H = Dimensions.get('window').height;
const SCREEN_W = Dimensions.get('window').width;

type Props = {
  /** 그릴 효과. 기본 'none'(흰 배경). */
  effect?: AmbientEffect;
};

/**
 * 부드럽게 좌우로 오가는 '바람' 값(0 → 1 → 0). 강수/잎이 이 값에 따라
 * 아주 천천히 흩날리는 방향이 바뀌어, 잔잔한 바람이 부는 듯 보인다.
 */
function useWind() {
  const v = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 6000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 6000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return v;
}

// ── 비 / 눈 ────────────────────────────────────────────────────────────────
function Precipitation({ kind, wind }: { kind: 'rain' | 'snow'; wind: Animated.Value }) {
  const isRain = kind === 'rain';
  const drops = useMemo(
    () =>
      Array.from({ length: isRain ? 18 : 14 }).map((_, i) => ({
        left: `${(i * 29 + 4) % 96}%`,
        size: isRain ? 6 + ((i * 3) % 3) : 6 + ((i * 5) % 6),
        dur: isRain ? 1500 + ((i * 170) % 900) : 6000 + ((i * 320) % 3600),
        delay: (i * 220) % 2600,
        flake: !isRain && i % 3 === 0,
      })),
    [isRain],
  );
  return (
    <>
      {drops.map((d, i) => (
        <Drop key={i} isRain={isRain} wind={wind} {...d} />
      ))}
    </>
  );
}

function Drop({ left, size, dur, delay, isRain, flake, wind }: { left: string; size: number; dur: number; delay: number; isRain: boolean; flake: boolean; wind: Animated.Value }) {
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

  const travel = SCREEN_H + 60;
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [-40, travel] });
  const windSpan = isRain ? 26 : 44;
  const windX = wind.interpolate({ inputRange: [0, 1], outputRange: [-windSpan, windSpan] });
  const translateX = Animated.multiply(windX, v);

  if (isRain) {
    return (
      <Animated.View
        style={{
          position: 'absolute', top: 0, left: left as never,
          width: Math.max(2, size * 0.35), height: size * 2.2, borderRadius: size,
          backgroundColor: 'rgba(120,170,240,0.35)', opacity: 0.5,
          transform: [{ translateY }, { translateX }, { rotate: '12deg' }],
        }}
      />
    );
  }
  if (flake) {
    return (
      <Animated.Text
        style={{ position: 'absolute', top: -40, left: left as never, fontSize: size + 5, color: 'rgba(150,190,230,0.75)', opacity: 0.75, transform: [{ translateY }, { translateX }] }}
      >
        ❄
      </Animated.Text>
    );
  }
  return (
    <Animated.View
      style={{
        position: 'absolute', top: 0, left: left as never, width: size, height: size, borderRadius: size,
        backgroundColor: 'rgba(210,228,250,0.9)', borderWidth: 1, borderColor: 'rgba(180,205,240,0.7)', opacity: 0.8,
        transform: [{ translateY }, { translateX }],
      }}
    />
  );
}

// ── 별 반짝 ──────────────────────────────────────────────────────────────────
function Stars() {
  const seeds = useMemo(
    () =>
      Array.from({ length: 22 }).map((_, i) => ({
        top: `${(i * 43 + 3) % 94}%`,
        left: `${(i * 61 + 7) % 95}%`,
        size: 3 + ((i * 7) % 4),
        dur: 1100 + ((i * 260) % 2200),
        delay: (i * 170) % 2200,
        gold: i % 2 === 0,
        spark: i % 5 === 0,
      })),
    [],
  );
  return (
    <>
      {seeds.map((s, i) => (
        <Sparkle key={i} {...s} />
      ))}
    </>
  );
}

function Sparkle({ top, left, size, dur, delay, gold, spark }: { top: string; left: string; size: number; dur: number; delay: number; gold: boolean; spark: boolean }) {
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
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.85] });
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  const color = gold ? 'rgba(245,192,64,0.95)' : 'rgba(129,140,248,0.95)';
  if (spark) {
    return (
      <Animated.Text style={{ position: 'absolute', top: top as never, left: left as never, fontSize: size + 7, opacity, transform: [{ scale }] }}>
        ✨
      </Animated.Text>
    );
  }
  return (
    <Animated.View
      style={{ position: 'absolute', top: top as never, left: left as never, width: size, height: size, borderRadius: size, backgroundColor: color, opacity, transform: [{ scale }] }}
    />
  );
}

// ── 바람(나뭇잎 흩날림) ───────────────────────────────────────────────────────
function Wind() {
  const leaves = useMemo(
    () =>
      Array.from({ length: 7 }).map((_, i) => ({
        top: `${8 + ((i * 13) % 78)}%`,
        size: 15 + ((i * 5) % 10),
        dur: 5200 + ((i * 720) % 4200),
        delay: (i * 640) % 3200,
        emoji: ['🍃', '🍃', '🌿', '🍂'][i % 4],
      })),
    [],
  );
  return (
    <>
      {leaves.map((l, i) => (
        <Leaf key={i} {...l} />
      ))}
    </>
  );
}

function Leaf({ top, size, dur, delay, emoji }: { top: string; size: number; dur: number; delay: number; emoji: string }) {
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
    const swayLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(sway, { toValue: 1, duration: dur / 4, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(sway, { toValue: 0, duration: dur / 4, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    swayLoop.start();
    return () => { loop.stop(); swayLoop.stop(); };
  }, [v, sway, dur, delay]);
  // 왼쪽 밖에서 오른쪽 밖으로 가로로 부드럽게 날려간다(바람 방향).
  const translateX = v.interpolate({ inputRange: [0, 1], outputRange: [-40, SCREEN_W + 40] });
  const translateY = sway.interpolate({ inputRange: [0, 1], outputRange: [-14, 14] });
  const rotate = sway.interpolate({ inputRange: [0, 1], outputRange: ['-25deg', '25deg'] });
  return (
    <Animated.Text
      style={{ position: 'absolute', top: top as never, left: 0, fontSize: size, opacity: 0.55, transform: [{ translateX }, { translateY }, { rotate }] }}
    >
      {emoji}
    </Animated.Text>
  );
}

/**
 * 전역 배경 앰비언트 레이어. 흰 배경은 그대로 두고, 선택한 테마 효과만
 * 화면 전체에 얇게 얹는다. 터치는 통과시킨다.
 */
export function AmbientSky({ effect = 'none' }: Props) {
  const wind = useWind();
  if (effect === 'none') return null;

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { width: SCREEN_W }]}>
      {effect === 'rain' && <Precipitation kind="rain" wind={wind} />}
      {effect === 'snow' && <Precipitation kind="snow" wind={wind} />}
      {effect === 'stars' && <Stars />}
      {effect === 'wind' && <Wind />}
    </Animated.View>
  );
}
