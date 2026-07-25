import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AmbientSky } from '../home/AmbientSky';
import { useWeather } from '../../hooks/useWeather';
import { useSettingsStore } from '../../store/settingsStore';
import type { AmbientEffect, AmbientThemeSetting } from '../../constants/ambient';
import type { Weather, WeatherCondition } from '../../domain/models/Weather';
import { WIND_STRONG_MS } from '../../domain/models/Weather';

// 전역 배경 앰비언트 — 앱 전체(학습카드 제외) 뒤에 깔린다.
// 배경 색은 앱 기본(흰색) 그대로 두고, 사용자가 고른 '배경 테마'(설정)에 따라
// 비/눈/별 반짝/바람 효과를 은은히 얹는다. 'auto' 는 날씨(useWeather) + 시간대를 따른다.
//
// auto 규칙(우선순위 순):
//   1) 비/뇌우 → 비        (날씨 API 필요)
//   2) 눈       → 눈        (날씨 API 필요)
//   3) 강풍     → 바람      (날씨 API 필요 — 풍속 ≥ WIND_STRONG_MS)
//   4) 밤 9시~새벽 → 별 반짝 (기기 시계만으로 동작 — API 불필요)
//   5) 그 외    → 없음(깔끔한 흰 배경)
// ⇒ 날씨 API 연결 전에는 1~3이 판정 불가(데이터 없음)라, 시간 기반인 '별 반짝'과
//    '없음'만 나타난다. (요청 사양: "api 연결 전엔 별 테마 외에는 없음이 맞음")

/** 밤(별 반짝을 켜는 시간대) — 밤 9시(21시)부터 새벽 5시 전까지. */
function isNightHour(hour: number): boolean {
  return hour >= 21 || hour < 5;
}

/** 설정 테마 + 현재 날씨 + 현재 시각으로, 실제로 그릴 효과를 결정한다. */
function resolveEffect(theme: AmbientThemeSetting, weather: Weather | undefined, hour: number): AmbientEffect {
  if (theme === 'off') return 'none';
  if (theme === 'auto') {
    const condition: WeatherCondition | undefined = weather?.condition;
    // 1) 실제 날씨가 가장 강한 신호 — 강수(비/눈)를 최우선.
    if (condition === 'rain' || condition === 'thunderstorm') return 'rain';
    if (condition === 'snow') return 'snow';
    // 2) 바람이 많이 부는 날 — 풍속 임계값 이상이면 바람 효과.
    if (weather?.windSpeedMs != null && weather.windSpeedMs >= WIND_STRONG_MS) return 'wind';
    // 3) 특별한 날씨가 없으면, 밤에는 별이 반짝(시간 기반 — API 없이도 동작).
    if (isNightHour(hour)) return 'stars';
    // 4) 낮 + 맑음/구름/안개 → 깔끔한 흰 배경.
    return 'none';
  }
  // 사용자가 특정 테마를 직접 고른 경우 — 항상 그 테마.
  return theme; // 'rain' | 'snow' | 'stars' | 'wind'
}

/** 앱바 높이(=MinimalHeader) / 하단 탭바 높이 — 배경 효과 페이드 경계 계산용. */
const APP_BAR_H = 58;
const TAB_BAR_H = 64;

export function WeatherBackground() {
  const { data: weather } = useWeather();
  const theme = useSettingsStore((s) => s.ambientTheme);
  // 앱바·탭바는 이 배경 위에 '불투명'하게 덮인다. 그 경계에서 눈/비가 툭 끊겨
  // 잘려 보이므로, 가려지는 높이를 넘겨 경계에서 서서히 나타나고 사라지게 한다.
  const insets = useSafeAreaInsets();

  // 'auto' 는 시각(밤 9시)에 따라 효과가 바뀌므로, 시간이 흘러 경계를 넘으면 자동 반영되도록
  // 몇 분마다 현재 시(hour)를 갱신한다. (auto 가 아니면 시각과 무관하니 타이머를 돌리지 않는다.)
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    if (theme !== 'auto') return;
    setHour(new Date().getHours());
    const id = setInterval(() => setHour(new Date().getHours()), 60_000);
    return () => clearInterval(id);
  }, [theme]);

  const effect = resolveEffect(theme, weather, hour);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <AmbientSky effect={effect} topInset={insets.top + APP_BAR_H} bottomInset={insets.bottom + TAB_BAR_H} />
    </View>
  );
}
