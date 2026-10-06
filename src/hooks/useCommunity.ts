import { useQuery } from '@tanstack/react-query';
import { communityRepository } from '../data/repositories';

/**
 * 실시간 커뮤니티 프레즌스 훅.
 * 15초마다 갱신해 접속자·활동 피드가 살아있는 것처럼 보이게 한다.
 */
export function useCommunity() {
  return useQuery({
    queryKey: ['community-live'],
    queryFn: () => communityRepository.getSnapshot(),
    refetchInterval: 15_000,
    staleTime: 8_000,
    // Loading-dependent sections remount after an error; do not restart retries on every mount.
    // Explicit retry, focus recovery and the polling interval still refresh the snapshot.
    retryOnMount: false,
  });
}
