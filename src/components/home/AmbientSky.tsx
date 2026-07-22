import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Dimensions } from 'react-native';
import type { AmbientEffect } from '../../constants/ambient';

// ── 전역 배경 앰비언트 테마 ────────────────────────────────────────────────
// 배경은 '흰색(앱 기본)' 그대로 두고, 선택한 테마 효과만 아주 잔잔하게 얹는다.
//  · rain  → 귀여운 물방울이 바람에 톡톡, 끊김 없이 계속 내림
//  · snow  → 눈결정(❄)이 아주 천천히, 끊김 없이 계속 살랑살랑 내림
//  · stars → 별모양(★/✦/✨)이 은은하게, 그러나 확실히 반짝반짝(계속)
//  · wind  → 태풍처럼 강한 바람 — 나뭇잎이 빠르게 휘몰아치고 바람결이 지나감
//  · none  → 아무것도 그리지 않음(깔끔한 흰 배경)
// 모든 요소는 pointerEvents="none" 로 터치를 막지 않으며, 가독성을 해치지 않도록
// 낮은 투명도로만 그린다.

const SCREEN_H = Dimensions.get('window').height;
const SCREEN_W = Dimensions.get('window').width;

type Props = {
  /** 그릴 효과. 기본 'none'(흰 배경). */
  effect?: AmbientEffect;
};

/**
 * 스태거 시작 지연은 '한 번만' 준 뒤, 이후에는 지연 없이 루프만 반복한다.
 * 이렇게 하면 매 사이클마다 지연이 다시 끼어들어 생기던 '끊김'이 사라지고,
 * 요소들이 끊김 없이 계속 이어져 내리는(반짝이는) 것처럼 보인다.
 */
function useLoopedValue(v: Animated.Value, build: () => Animated.CompositeAnimation, delay: number, deps: React.DependencyList) {
  useEffect(() => {
    let anim: Animated.CompositeAnimation | undefined;
    const timer = setTimeout(() => {
      anim = Animated.loop(build());
      anim.start();
    }, delay);
    return () => {
      clearTimeout(timer);
      anim?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * 부드럽게 좌우로 오가는 '바람' 값(0 → 1 → 0). 강수/잎이 이 값에 따라
 * 흩날리는 방향이 바뀌어, 바람이 부는 듯 보인다. `strong` 이면 더 빠르게 분다.
 */
function useWind(strong = false) {
  const v = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const half = strong ? 1600 : 6000;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, strong]);
  return v;
}

// ── 비 / 눈 ────────────────────────────────────────────────────────────────
function Precipitation({ kind, wind }: { kind: 'rain' | 'snow'; wind: Animated.Value }) {
  const isRain = kind === 'rain';
  const drops = useMemo(
    () =>
      Array.from({ length: isRain ? 30 : 24 }).map((_, i) => ({
        left: `${(i * 27 + 3) % 97}%`,
        // 비는 자잘하고 귀엽게, 눈결정은 크기를 조금 키운다.
        size: isRain ? 7 + ((i * 3) % 4) : 11 + ((i * 5) % 9),
        // 눈은 아주 천천히(느리게), 비는 톡톡 떨어지되 과하지 않게.
        dur: isRain ? 1900 + ((i * 170) % 1100) : 11000 + ((i * 520) % 8000),
        delay: isRain ? (i * 150) % 2200 : (i * 640) % 9000,
        // 눈은 전부 눈결정(❄) 모양으로 내리게 한다.
        flake: !isRain,
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
  const spin = useRef(new Animated.Value(0)).current;
  useLoopedValue(
    v,
    () => Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.linear, useNativeDriver: true }),
    delay,
    [v, dur, delay],
  );
  // 눈결정은 내리면서 살짝 빙글빙글 돈다(더 눈결정답게).
  useEffect(() => {
    if (isRain) return;
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: dur * 1.6, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin, dur, isRain]);

  const travel = SCREEN_H + 60;
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [-40, travel] });
  const windSpan = isRain ? 24 : 52; // 눈은 더 크게 살랑살랑
  const windX = wind.interpolate({ inputRange: [0, 1], outputRange: [-windSpan, windSpan] });
  const translateX = Animated.multiply(windX, v);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  if (isRain) {
    // 귀여운 물방울: 위는 뾰족, 아래는 둥근 톤. 은은한 하늘색.
    return (
      <Animated.View
        style={{
          position: 'absolute', top: 0, left: left as never,
          width: size * 0.8, height: size * 1.15,
          borderTopLeftRadius: size, borderTopRightRadius: size,
          borderBottomLeftRadius: size * 0.9, borderBottomRightRadius: size * 0.9,
          backgroundColor: 'rgba(110,170,240,0.5)', opacity: 0.82,
          transform: [{ translateY }, { translateX }],
        }}
      />
    );
  }
  // 눈결정(❄) — 전부 결정 모양으로.
  return (
    <Animated.Text
      style={{
        position: 'absolute', top: -40, left: left as never,
        fontSize: size, color: 'rgba(140,190,232,0.92)', opacity: 0.92,
        transform: [{ translateY }, { translateX }, { rotate }],
      }}
    >
      ❄
    </Animated.Text>
  );
}

// ── 별 반짝 ──────────────────────────────────────────────────────────────────
const STAR_GLYPHS = ['★', '✦', '✨', '⭐'];

function Stars() {
  const seeds = useMemo(
    () =>
      Array.from({ length: 34 }).map((_, i) => ({
        top: `${(i * 37 + 3) % 92}%`,
        left: `${(i * 61 + 7) % 95}%`,
        size: 9 + ((i * 7) % 9),
        dur: 900 + ((i * 260) % 1600),
        delay: (i * 130) % 1800,
        gold: i % 2 === 0,
        glyph: STAR_GLYPHS[i % STAR_GLYPHS.length],
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

function Sparkle({ top, left, size, dur, delay, gold, glyph }: { top: string; left: string; size: number; dur: number; delay: number; gold: boolean; glyph: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useLoopedValue(
    v,
    () =>
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: dur, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    delay,
    [v, dur, delay],
  );
  // 확실히 반짝이도록 대비를 키운다(0.2 → 1.0).
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] });
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.15] });
  const rotate = v.interpolate({ inputRange: [0, 1], outputRange: ['-18deg', '18deg'] });
  const color = gold ? 'rgba(245,190,60,0.98)' : 'rgba(129,140,248,0.98)';
  return (
    <Animated.Text
      style={{
        position: 'absolute', top: top as never, left: left as never,
        fontSize: size, color, opacity,
        transform: [{ scale }, { rotate }],
      }}
    >
      {glyph}
    </Animated.Text>
  );
}

// ── 바람 (태풍) ───────────────────────────────────────────────────────────────
function Wind({ wind }: { wind: Animated.Value }) {
  const leaves = useMemo(
    () =>
      // 태풍답게 잎을 더 많이, 더 빠르게.
      Array.from({ length: 18 }).map((_, i) => ({
        top: `${4 + ((i * 11) % 88)}%`,
        size: 16 + ((i * 5) % 12),
        dur: 2000 + ((i * 360) % 2600),
        delay: (i * 260) % 2600,
        emoji: ['🍃', '🍃', '🌿', '🍂'][i % 4],
      })),
    [],
  );
  const gusts = useMemo(
    () =>
      Array.from({ length: 5 }).map((_, i) => ({
        top: `${12 + ((i * 19) % 72)}%`,
        dur: 1300 + ((i * 240) % 1000),
        delay: (i * 420) % 2000,
        len: 60 + ((i * 37) % 90),
      })),
    [],
  );
  return (
    <>
      {gusts.map((g, i) => (
        <Gust key={`g${i}`} {...g} />
      ))}
      {leaves.map((l, i) => (
        <Leaf key={`l${i}`} wind={wind} {...l} />
      ))}
    </>
  );
}

// 화면을 빠르게 가로지르는 옅은 '바람결' 선.
function Gust({ top, dur, delay, len }: { top: string; dur: number; delay: number; len: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useLoopedValue(
    v,
    () => Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    delay,
    [v, dur, delay],
  );
  const translateX = v.interpolate({ inputRange: [0, 1], outputRange: [-len - 20, SCREEN_W + 20] });
  const opacity = v.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 0.35, 0.35, 0] });
  return (
    <Animated.View
      style={{
        position: 'absolute', top: top as never, left: 0,
        width: len, height: 2, borderRadius: 2,
        backgroundColor: 'rgba(150,175,200,0.5)',
        transform: [{ translateX }, { rotate: '-6deg' }],
        opacity,
      }}
    />
  );
}

function Leaf({ top, size, dur, delay, emoji, wind }: { top: string; size: number; dur: number; delay: number; emoji: string; wind: Animated.Value }) {
  const v = useRef(new Animated.Value(0)).current;
  const sway = useRef(new Animated.Value(0)).current;
  useLoopedValue(
    v,
    () => Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.linear, useNativeDriver: true }),
    delay,
    [v, dur, delay],
  );
  useEffect(() => {
    const swayLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(sway, { toValue: 1, duration: dur / 6, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(sway, { toValue: 0, duration: dur / 6, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    swayLoop.start();
    return () => swayLoop.stop();
  }, [sway, dur]);
  // 왼쪽 밖에서 오른쪽 밖으로 빠르게 휘몰아친다(태풍 바람 방향).
  const translateX = v.interpolate({ inputRange: [0, 1], outputRange: [-40, SCREEN_W + 40] });
  // 바람이 셀 때(바람값이 클 때) 상하 흔들림을 더 크게.
  const swayY = sway.interpolate({ inputRange: [0, 1], outputRange: [-26, 26] });
  const windY = wind.interpolate({ inputRange: [0, 1], outputRange: [-10, 10] });
  const translateY = Animated.add(swayY, windY);
  const rotate = sway.interpolate({ inputRange: [0, 1], outputRange: ['-70deg', '70deg'] });
  return (
    <Animated.Text
      style={{ position: 'absolute', top: top as never, left: 0, fontSize: size, opacity: 0.7, transform: [{ translateX }, { translateY }, { rotate }] }}
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
  // 바람 테마(태풍)는 더 강한 바람 값을 쓴다.
  const wind = useWind(effect === 'wind');
  if (effect === 'none') return null;

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { width: SCREEN_W }]}>
      {effect === 'rain' && <Precipitation kind="rain" wind={wind} />}
      {effect === 'snow' && <Precipitation kind="snow" wind={wind} />}
      {effect === 'stars' && <Stars />}
      {effect === 'wind' && <Wind wind={wind} />}
    </Animated.View>
  );
}
