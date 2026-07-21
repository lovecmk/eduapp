import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AmbientSky } from '../home/AmbientSky';
import { useWeather } from '../../hooks/useWeather';

// 전역 날씨 배경 — 앱 전체(학습카드 제외) 뒤에 깔린다.
// 배경 색은 앱 기본(흰색) 그대로 두고, 날씨(useWeather)에 따라 잔잔한
// 비/눈만 은은히 내린다. 맑을 때는 아무것도 그리지 않아 깔끔한 흰 배경.
export function WeatherBackground() {
  const { data: weather } = useWeather();

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <AmbientSky condition={weather?.condition} />
    </View>
  );
}
