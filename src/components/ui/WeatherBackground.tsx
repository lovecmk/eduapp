import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AmbientSky } from '../home/AmbientSky';
import { getDaylight } from '../../utils/daylight';
import { useWeather } from '../../hooks/useWeather';

// 전역 날씨/시간대 배경 — 앱 전체(학습카드 제외) 뒤에 깔린다.
// 시간대는 로컬 시계로(getDaylight), 날씨는 useWeather(추후 실 API)로 결정한다.
// 자정 등 시간대 경계를 지나면 자연스럽게 바뀌도록 1분마다 phase 를 재평가한다.
export function WeatherBackground() {
  const { data: weather } = useWeather();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const daylight = useMemo(() => getDaylight(new Date(now)), [now]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <AmbientSky phase={daylight.phase} condition={weather?.condition} />
    </View>
  );
}
