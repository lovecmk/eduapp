import { useQuery } from '@tanstack/react-query';
import { userDirectoryRepository } from '../data/repositories';

/** 닉네임 검색 — 2글자 이상일 때만 조회(디바운스는 화면에서 처리). */
export function useUserSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ['userSearch', q],
    queryFn: () => userDirectoryRepository.search(q),
    enabled: q.length >= 1,
    staleTime: 30_000,
  });
}

/** 공개 프로필 상세 — 허용 범위까지만 채워진다. */
export function usePublicProfile(id: string | undefined) {
  return useQuery({
    queryKey: ['publicProfile', id],
    queryFn: () => userDirectoryRepository.getProfile(id as string),
    enabled: !!id,
    staleTime: 30_000,
  });
}
