// 배경 앰비언트 '테마' — 흰 배경 위에 은은히 운영하는 분위기 효과.
// 실제로 화면에 그려지는 효과 종류.
export type AmbientEffect = 'none' | 'rain' | 'snow' | 'stars' | 'wind';

// 사용자가 설정에서 고르는 값. 'auto' 는 날씨(useWeather)에 따라 비/눈을 자동 표시,
// 'off' 는 아무 효과도 없는 깔끔한 흰 배경. 나머지는 해당 테마를 항상 켠다.
export type AmbientThemeSetting = 'auto' | 'off' | 'rain' | 'snow' | 'stars' | 'wind';

export const AMBIENT_THEME_OPTIONS: { value: AmbientThemeSetting; label: string; icon: string }[] = [
  { value: 'auto', label: '자동(날씨)', icon: 'sync-outline' },
  { value: 'off', label: '없음', icon: 'ban-outline' },
  { value: 'rain', label: '비', icon: 'rainy-outline' },
  { value: 'snow', label: '눈', icon: 'snow-outline' },
  { value: 'stars', label: '별 반짝', icon: 'sparkles-outline' },
  { value: 'wind', label: '바람', icon: 'leaf-outline' },
];
