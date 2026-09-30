import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { DiffVote, PollCounts } from '../domain/models/DifficultyPoll';

export type { DiffVote, PollCounts } from '../domain/models/DifficultyPoll';

interface DiffPollState {
  myVotes: Record<string, DiffVote>;
  /**
   * 서버가 받은 표 — 서버가 없던 동안 기기에만 남은 표를 나중에 올리기 위한 장부
   * (data/sync/localBackfill). myVotes 와 다르면 아직 안 올라간 것이다.
   */
  sent: Record<string, DiffVote>;
  vote: (cardId: string, choice: DiffVote) => void;
  markSent: (cardId: string, choice: DiffVote) => void;
}

/** 카드별 체감 난이도 투표 — 내 투표만 영속화(커뮤니티 기준치는 결정적으로 생성). */
export const useDiffPollStore = create<DiffPollState>()(
  persist(
    (set) => ({
      myVotes: {},
      sent: {},
      vote: (cardId, choice) => set((s) => ({ myVotes: { ...s.myVotes, [cardId]: choice } })),
      markSent: (cardId, choice) => set((s) => ({ sent: { ...s.sent, [cardId]: choice } })),
    }),
    { name: 'diff-poll', version: 1, storage: createJSONStorage(() => AsyncStorage) },
  ),
);

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

/**
 * 카드별 가상 투표 수(결정적) — **목업 모드 시연 전용.** 실서버 모드에서는 쓰지 않는다
 * (MockDifficultyPollRepository 가 env.useMockData 일 때만 부른다).
 */
export function baseCounts(cardId: string): PollCounts {
  const h = hash(cardId);
  const total = 40 + (h % 120);
  const easyW = 2 + (h % 5);
  const normalW = 3 + ((h >> 3) % 5);
  const hardW = 2 + ((h >> 6) % 5);
  const sum = easyW + normalW + hardW;
  const easy = Math.round((easyW / sum) * total);
  const normal = Math.round((normalW / sum) * total);
  const hard = Math.max(0, total - easy - normal);
  return { easy, normal, hard };
}
