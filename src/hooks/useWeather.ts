import { useQuery } from '@tanstack/react-query';
import { weatherRepository } from '../data/repositories';

/**
 * 현재 날씨 — 홈 배경 앰비언트 효과 구동용.
 * 30분 캐시(날씨는 자주 바뀌지 않는다). 실패해도 UI 는 시간대 효과로 폴백하므로
 * 조용히 실패시키고(에러 무시) 배경만 담백하게 유지한다.
 */
export function useWeather() {
  return useQuery({
    queryKey: ['weather'],
    queryFn: () => weatherRepository.getCurrent(),
    staleTime: 30 * 60_000,
    retry: 1,
  });
}
