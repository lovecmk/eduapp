import { useQuery } from '@tanstack/react-query';
import { statsRepository } from '../data/repositories';

export function useStudyStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: () => statsRepository.getStudyStats(),
    staleTime: 30_000,
  });
}
