import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AmbientSky } from '../home/AmbientSky';
import { useWeather } from '../../hooks/useWeather';
import { useSettingsStore } from '../../store/settingsStore';
import type { AmbientEffect, AmbientThemeSetting } from '../../constants/ambient';
import type { WeatherCondition } from '../../domain/models/Weather';

// 전역 배경 앰비언트 — 앱 전체(학습카드 제외) 뒤에 깔린다.
// 배경 색은 앱 기본(흰색) 그대로 두고, 사용자가 고른 '배경 테마'(설정)에 따라
// 비/눈/별 반짝/바람 효과를 은은히 얹는다. 'auto' 는 날씨(useWeather)를 따른다.

/** 설정 테마 + 현재 날씨로, 실제로 그릴 효과를 결정한다. */
function resolveEffect(theme: AmbientThemeSetting, condition?: WeatherCondition): AmbientEffect {
  if (theme === 'off') return 'none';
  if (theme === 'auto') {
    if (condition === 'rain' || condition === 'thunderstorm') return 'rain';
    if (condition === 'snow') return 'snow';
    return 'none'; // 맑음/구름/안개 → 깔끔한 흰 배경
  }
  return theme; // 'rain' | 'snow' | 'stars' | 'wind'
}

export function WeatherBackground() {
  const { data: weather } = useWeather();
  const theme = useSettingsStore((s) => s.ambientTheme);
  const effect = resolveEffect(theme, weather?.condition);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <AmbientSky effect={effect} />
    </View>
  );
}
