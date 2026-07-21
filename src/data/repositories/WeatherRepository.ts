import type { IWeatherRepository } from '../../domain/repositories/IWeatherRepository';
import type { Weather } from '../../domain/models/Weather';
import { normalizeOpenWeather, weatherLabel } from '../../domain/models/Weather';
import { apiClient } from '../network/ApiClient';

/**
 * 실서버 날씨 저장소 — `GET /api/weather/current` 응답을 도메인으로 매핑.
 *
 * ⚠️ 아직 실제 날씨 API 는 연동 전이다(사용자가 추후 붙일 예정).
 *    이 클래스는 "연동 지점(seam)"을 미리 만들어 둔 것으로, 응답 스키마만
 *    확정되면 아래 DTO 매핑을 채우면 바로 동작한다.
 *
 * 연동 옵션 예시:
 *  1) 자체 백엔드가 정규화해서 내려주는 경우 → condition 을 그대로 사용.
 *  2) 백엔드가 OpenWeather 원본을 프록시하는 경우 → normalizeOpenWeather() 로 변환.
 */
interface WeatherDTO {
  /** 이미 정규화된 상태를 주는 경우(권장). */
  condition?: string;
  /** OpenWeather 원본을 그대로 프록시하는 경우. */
  weather?: { main?: string; id?: number; description?: string }[];
  main?: { temp?: number };
  /** 정규화 서버가 기온을 평평하게 주는 경우. */
  temperature_c?: number;
  observed_at?: string;
}

const VALID = new Set(['clear', 'clouds', 'rain', 'snow', 'thunderstorm', 'mist']);

export class WeatherRepository implements IWeatherRepository {
  async getCurrent(): Promise<Weather> {
    const dto = await apiClient.get<WeatherDTO>('/api/weather/current');

    // 1) 서버가 이미 정규화 상태를 주면 그대로 신뢰(유효값일 때).
    // 2) 아니면 OpenWeather 원본에서 정규화.
    const condition =
      dto.condition && VALID.has(dto.condition)
        ? (dto.condition as Weather['condition'])
        : normalizeOpenWeather(dto.weather?.[0]?.main, dto.weather?.[0]?.id);

    const temperatureC = dto.temperature_c ?? dto.main?.temp ?? null;

    return {
      condition,
      temperatureC: typeof temperatureC === 'number' ? Math.round(temperatureC) : null,
      description: dto.weather?.[0]?.description || weatherLabel(condition),
      observedAt: dto.observed_at ?? new Date().toISOString(),
    };
  }
}
