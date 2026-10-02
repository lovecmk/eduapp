import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { feedRepository } from '../data/repositories';
import type { ReactionKind, ShareCardPost, ShareCardUpload } from '../domain/models/Feed';
import { withReaction } from '../domain/models/Feed';
import { useDegraded } from './useDegraded';
import { env } from '../data/network/env';
import { logger } from '../utils/logger';
import { getSessionEpoch } from '../data/network/sessionEpoch';

export const FEED_KEY = ['feed'] as const;

/**
 * 자랑 피드 — 화면은 이 훅만 본다. 서버(`/inner/api/v1/feed`)든 이 기기 안이든 같은 모양이다.
 * `localOnly` 는 지금 글이 남에게 보이지 않는 상태인가(목업 모드 제외 · 서버 미배포/못 닿음).
 */
export function useFeed() {
  const query = useQuery({ queryKey: FEED_KEY, queryFn: () => feedRepository.list(), staleTime: 30_000 });
  const degraded = useDegraded('feed');
  return { ...query, posts: query.data ?? [], localOnly: !env.useMockData && degraded };
}

/** 성취 카드 올리기. */
export function usePostToFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ShareCardUpload) => feedRepository.post(input),
    onSuccess: (post) => {
      qc.setQueryData<ShareCardPost[]>(FEED_KEY, (old) => [post, ...(old ?? []).filter((p) => p.id !== post.id)]);
    },
  });
}

/** 리액션 켜기/끄기 — 화면은 곧바로 바뀌고(낙관적), 실패하면 되돌린다. */
export function useFeedReaction() {
  const qc = useQueryClient();
  return (postId: string, kind: ReactionKind) => {
    const epoch = getSessionEpoch();
    const prev = qc.getQueryData<ShareCardPost[]>(FEED_KEY) ?? [];
    const target = prev.find((p) => p.id === postId);
    if (!target) return;
    const on = !target.myReactions.includes(kind);
    qc.setQueryData<ShareCardPost[]>(FEED_KEY, prev.map((p) => (p.id === postId ? withReaction(p, kind, on) : p)));
    feedRepository.setReaction(postId, kind, on).catch((e) => {
      if (epoch !== getSessionEpoch()) return;
      qc.setQueryData(FEED_KEY, prev);
      logger.warn('feed.reaction_failed', { reason: String(e) });
    });
  };
}
