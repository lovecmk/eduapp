// 날씨 도메인 모델 — 홈 배경의 '시간대 + 날씨' 앰비언트 효과를 구동한다.
// ⚠️ 실제 날씨 API 연동은 추후 사용자가 붙일 예정.
//    이 파일은 그 자리(도메인 타입)와 정규화 규칙만 미리 확정해 둔다.
//    실서버 응답이 OpenWeather 계열이든 자체 서버든, 아래 정규화 union 으로만
//    UI 가 의존하므로 어떤 공급자를 붙여도 화면 코드는 바뀌지 않는다.

/** UI 가 의존하는 정규화된 날씨 상태(공급자 무관). */
export type WeatherCondition =
  | 'clear' // 맑음
  | 'clouds' // 구름·흐림
  | 'rain' // 비
  | 'snow' // 눈
  | 'thunderstorm' // 뇌우
  | 'mist'; // 안개·연무

export interface Weather {
  /** 정규화된 상태 — 배경 효과 선택의 유일한 기준. */
  condition: WeatherCondition;
  /** 섭씨 기온(없으면 null). */
  temperatureC: number | null;
  /** 풍속(m/s). 없으면 null. '바람이 많이 부는' 날의 배경 효과(wind) 판정에 쓰인다. */
  windSpeedMs: number | null;
  /** 사람이 읽는 짧은 설명(예: '맑음', '비'). */
  description: string;
  /** 관측 시각 ISO 문자열. */
  observedAt: string;
}

/**
 * '바람이 많이 분다'고 볼 풍속 임계값(m/s).
 * 보퍼트 6('된바람', strong breeze ≈ 10.8m/s)에 해당 — 나뭇가지가 흔들리고
 * 우산을 쓰기 힘든, 눈에 띄게 바람이 센 상태. 이 이상이면 배경에 바람 효과를 켠다.
 */
export const WIND_STRONG_MS = 10.8;

const KO_LABEL: Record<WeatherCondition, string> = {
  clear: '맑음',
  clouds: '구름 많음',
  rain: '비',
  snow: '눈',
  thunderstorm: '뇌우',
  mist: '안개',
};

/** 정규화 상태의 한국어 라벨. */
export function weatherLabel(condition: WeatherCondition): string {
  return KO_LABEL[condition] ?? '맑음';
}

/**
 * OpenWeather 계열 응답 코드/그룹을 정규화 union 으로 매핑한다.
 * 추후 사용자가 OpenWeather 를 붙이면 `weather[0].main`(또는 id) 을 그대로 넘기면 된다.
 * 자체 서버라면 서버가 이미 정규화된 값을 주도록 하고 이 매퍼를 건너뛰어도 된다.
 */
export function normalizeOpenWeather(main: string | undefined, id?: number): WeatherCondition {
  // id 기반(더 정확) — https://openweathermap.org/weather-conditions
  if (typeof id === 'number') {
    if (id >= 200 && id < 300) return 'thunderstorm';
    if (id >= 300 && id < 400) return 'rain'; // 이슬비 → 비로 취급
    if (id >= 500 && id < 600) return 'rain';
    if (id >= 600 && id < 700) return 'snow';
    if (id >= 700 && id < 800) return 'mist';
    if (id === 800) return 'clear';
    if (id > 800) return 'clouds';
  }
  switch ((main ?? '').toLowerCase()) {
    case 'thunderstorm':
      return 'thunderstorm';
    case 'drizzle':
    case 'rain':
      return 'rain';
    case 'snow':
      return 'snow';
    case 'mist':
    case 'smoke':
    case 'haze':
    case 'fog':
    case 'dust':
    case 'sand':
    case 'ash':
      return 'mist';
    case 'clouds':
      return 'clouds';
    case 'clear':
    default:
      return 'clear';
  }
}
