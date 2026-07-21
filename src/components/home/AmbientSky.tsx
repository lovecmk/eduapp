import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Dimensions } from 'react-native';
import type { DayPhase } from '../../utils/daylight';
import type { WeatherCondition } from '../../domain/models/Weather';

// ── 전역 날씨 배경 앰비언트 ────────────────────────────────────────────────
// 배경은 '흰색(앱 기본 배경)' 그대로 두고, 날씨에 따라 아주 잔잔하게
// 비/눈만 내리도록 한다. 채팅방처럼 은은한 강수 + 바람에 살짝 흩날리는 느낌.
//  · 비  → 옅은 빗줄기가 바람에 비스듬히 톡톡 내림
//  · 눈  → 폭신한 눈송이가 바람에 살랑살랑 내림
//  · 그 외(맑음/구름/안개) → 아무것도 그리지 않음 → 흰 배경 유지
// 모든 요소는 pointerEvents="none" 로 터치를 막지 않으며, 가독성을 해치지 않도록
// 낮은 투명도로만, 적은 개수로 아주 잔잔하게 그린다.

const SCREEN_H = Dimensions.get('window').height;
const SCREEN_W = Dimensions.get('window').width;

type Props = {
  /** (호환용) 시간대 — 이제 배경 색에는 쓰지 않는다. 흰 배경 유지. */
  phase?: DayPhase;
  /** 날씨(없으면 맑음으로 간주 — 아무 효과도 없음). */
  condition?: WeatherCondition;
};

/**
 * 부드럽게 좌우로 오가는 '바람' 값(-1 → 1 → -1). 강수 전체가 이 값에 따라
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

/** 낙하 파티클(비 또는 눈)을 화면 높이만큼 잔잔히 떨어뜨린다. */
function Precipitation({ kind, wind }: { kind: 'rain' | 'snow'; wind: Animated.Value }) {
  const isRain = kind === 'rain';
  // 잔잔하게 — 비 18줄기, 눈 14송이 정도만.
  const drops = useMemo(
    () =>
      Array.from({ length: isRain ? 18 : 14 }).map((_, i) => ({
        left: `${(i * 29 + 4) % 96}%`,
        size: isRain ? 6 + ((i * 3) % 3) : 6 + ((i * 5) % 6), // 방울/눈송이 크기
        dur: isRain ? 1500 + ((i * 170) % 900) : 6000 + ((i * 320) % 3600),
        delay: (i * 220) % 2600,
        flake: !isRain && i % 3 === 0, // 일부 눈은 ❄ 모양으로
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

function Drop({
  left,
  size,
  dur,
  delay,
  isRain,
  flake,
  wind,
}: {
  left: string;
  size: number;
  dur: number;
  delay: number;
  isRain: boolean;
  flake: boolean;
  wind: Animated.Value;
}) {
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
  // 바람 — 비는 조금 더, 눈은 폭넓게 흩날린다. 낙하 진행에 비례해 바람의 영향이 커진다.
  const windSpan = isRain ? 26 : 44;
  const windX = wind.interpolate({ inputRange: [0, 1], outputRange: [-windSpan, windSpan] });
  const translateX = Animated.multiply(windX, v); // 아래로 갈수록 바람에 더 밀린다

  if (isRain) {
    // 잔잔한 빗줄기 — 옅고 가는 물줄기(바람에 살짝 기운다).
    return (
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          left: left as never,
          width: Math.max(2, size * 0.35),
          height: size * 2.2,
          borderRadius: size,
          backgroundColor: 'rgba(120,170,240,0.35)',
          opacity: 0.5,
          transform: [{ translateY }, { translateX }, { rotate: '12deg' }],
        }}
      />
    );
  }
  // 잔잔한 눈 — 일부는 ❄, 나머지는 폭신한 눈송이.
  if (flake) {
    return (
      <Animated.Text
        style={{
          position: 'absolute',
          top: -40,
          left: left as never,
          fontSize: size + 5,
          color: 'rgba(150,190,230,0.75)',
          opacity: 0.75,
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
        backgroundColor: 'rgba(210,228,250,0.9)',
        borderWidth: 1,
        borderColor: 'rgba(180,205,240,0.7)',
        opacity: 0.8,
        transform: [{ translateY }, { translateX }],
      }}
    />
  );
}

/**
 * 전역 날씨 배경 앰비언트 레이어. 흰 배경은 그대로 두고, 날씨에 따라
 * 잔잔한 비/눈만 화면 전체에 얇게 내린다. 터치는 통과시킨다.
 */
export function AmbientSky({ condition = 'clear' }: Props) {
  const showRain = condition === 'rain' || condition === 'thunderstorm';
  const showSnow = condition === 'snow';
  const wind = useWind();

  // 맑음/구름/안개 등: 아무것도 그리지 않아 흰 배경을 유지한다.
  if (!showRain && !showSnow) return null;

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { width: SCREEN_W }]}>
      {showRain && <Precipitation kind="rain" wind={wind} />}
      {showSnow && <Precipitation kind="snow" wind={wind} />}
    </Animated.View>
  );
}
