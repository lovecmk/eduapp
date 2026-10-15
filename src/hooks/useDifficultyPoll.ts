import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { difficultyPollRepository } from '../data/repositories';
import type { DiffVote, PollSummary } from '../domain/models/DifficultyPoll';
import { useDiffPollStore } from '../store/diffPollStore';
import { logger } from '../utils/logger';

export const pollKey = (cardId: string) => ['difficulty-poll', cardId] as const;

/**
 * 한 카드의 체감 난이도 현황 — 서버가 열리면 다른 점검자들의 분포(counts)가 채워진다.
 * counts 가 null 이면 모을 곳이 없다는 뜻이고, 화면은 분포 대신 '준비 중'을 말한다.
 */
export function useDifficultyPoll(cardId: string): PollSummary & { loaded: boolean } {
  const localMine = useDiffPollStore((s) => s.myVotes[cardId] ?? null);
  const query = useQuery({ queryKey: pollKey(cardId), queryFn: () => difficultyPollRepository.get(cardId), staleTime: 60_000 });
  // 내 표는 이 기기 기록이 가장 빠르다(방금 누른 것). 서버가 아는 표는 다른 기기에서 누른 것일 수 있다.
  const mine = localMine ?? query.data?.mine ?? null;
  return { counts: query.data?.counts ?? null, mine, loaded: query.isSuccess };
}

/**
 * 투표 — 학습 화면에서 넘기기 직전 선택을 기록한다. 복습 상세는 조회만 한다.
 * 기기에 먼저 남겨(다시 묻지 않게) 화면을 바로 바꾸고, 서버로는 뒤에서 보낸다
 * (연결이 없으면 오프라인 큐가 들고 있다가 보낸다).
 */
export function useDifficultyVote() {
  const qc = useQueryClient();
  return useCallback((cardId: string, choice: DiffVote) => {
    const prevMine = useDiffPollStore.getState().myVotes[cardId] ?? null;
    useDiffPollStore.getState().vote(cardId, choice);
    qc.setQueryData<PollSummary>(pollKey(cardId), (old) => {
      if (!old?.counts) return old ? { ...old, mine: choice } : old;
      const counts = { ...old.counts };
      if (prevMine) counts[prevMine] = Math.max(0, counts[prevMine] - 1);
      counts[choice] += 1;
      return { counts, mine: choice };
    });
    difficultyPollRepository.vote(cardId, choice).then(() => {
      // 서버가 받았으면 장부에 적는다. 기기 안으로 떨어졌으면(서버 미배포) 적지 않는다 —
      // 그 표는 서버가 열리면 localBackfill 이 올린다.
      useDiffPollStore.getState().markSent(cardId, choice);
    }).catch((e) => {
      logger.warn('difficulty_poll.vote_failed', { reason: String(e) });
    });
  }, [qc]);
}
