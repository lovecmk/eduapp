import type { IWeatherRepository } from '../../../../domain/repositories/IWeatherRepository';
import type { Weather, WeatherCondition } from '../../../../domain/models/Weather';
import { weatherLabel } from '../../../../domain/models/Weather';
import { delay } from '../../../../data/repositories/_delay';

/**
 * 날씨 목업 — 실제 날씨 API 연동 전까지 사용하는 임시 소스.
 *
 * 기본은 '맑음(clear)'으로 두어 화면이 차분하게 보이도록 한다.
 * (비/눈 효과는 실제 API 를 붙이면 그때 자연스럽게 나타난다.)
 *
 * 개발 중 다른 날씨 효과를 눈으로 확인하고 싶으면 아래 MOCK_CONDITION 만 바꾼다.
 * 예: 'rain' 으로 두면 홈 배경에 빗줄기 효과가 나타난다.
 */
const MOCK_CONDITION: WeatherCondition = 'clear';

export class MockWeatherRepository implements IWeatherRepository {
  async getCurrent(): Promise<Weather> {
    await delay(300);
    return {
      condition: MOCK_CONDITION,
      temperatureC: 22,
      // 실제 날씨 API 연동 전에는 바람 정보가 없다(null) — 바람 효과는 켜지지 않는다.
      // (밤 9시 이후의 '별 반짝'만 기기 시계로 자동 표시된다.)
      windSpeedMs: null,
      description: weatherLabel(MOCK_CONDITION),
      observedAt: new Date().toISOString(),
    };
  }
}
