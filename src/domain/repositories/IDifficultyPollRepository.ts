import type { DiffVote, PollSummary } from '../models/DifficultyPoll';

/** 체감 난이도 투표 저장소 — 서버 `/inner/api/v1/cards/:id/difficulty`(미배포 → 내 표만 기기에). */
export interface IDifficultyPollRepository {
  get(cardId: string): Promise<PollSummary>;
  /** 내 표를 설정한다(다시 투표하면 바뀐다). */
  vote(cardId: string, choice: DiffVote): Promise<void>;
}
