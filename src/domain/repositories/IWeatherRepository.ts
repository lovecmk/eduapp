import type { Weather } from '../models/Weather';

/**
 * 현재 날씨 조회 저장소 인터페이스.
 * 홈 배경의 앰비언트 효과(비/눈/맑음 등)를 구동하기 위한 최소 계약.
 * 실제 API 연동은 추후 사용자가 `WeatherRepository`(실서버) 구현을 채워 붙인다.
 */
export interface IWeatherRepository {
  /** 사용자 위치(또는 기본 지역)의 현재 날씨를 반환. */
  getCurrent(): Promise<Weather>;
}
