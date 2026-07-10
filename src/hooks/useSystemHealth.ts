import { useQuery } from '@tanstack/react-query';
import { systemRepository } from '../data/repositories';

/**
 * 백엔드 상태를 주기적으로 폴링하는 훅.
 * 상태 위젯이 "실시간 모니터링"처럼 보이도록 20초마다 자동 갱신한다.
 */
export function useSystemHealth() {
  return useQuery({
    queryKey: ['system-health'],
    queryFn: () => systemRepository.getHealth(),
    refetchInterval: 20_000,
    staleTime: 10_000,
  });
}
