import type { IDifficultyPollRepository } from '../../domain/repositories/IDifficultyPollRepository';
import type { DiffVote, PollSummary } from '../../domain/models/DifficultyPoll';
import { useDiffPollStore, baseCounts } from '../../store/diffPollStore';
import { env } from '../network/env';
import { delay } from './_delay';

/**
 * 체감 난이도 — 내 표는 이 기기(diffPollStore)에.
 *
 * 다른 사람의 분포는 **목업 모드 시연에서만** 지어낸다(baseCounts). 실서버 모드에서
 * 서버에 닿지 못해 여기로 떨어진 경우에는 counts 를 null 로 돌려 화면이 '준비 중'을
 * 말하게 한다 — 폴백이 여론을 지어내면 안 된다.
 */
export class MockDifficultyPollRepository implements IDifficultyPollRepository {
  async get(cardId: string): Promise<PollSummary> {
    await delay(40);
    const mine = useDiffPollStore.getState().myVotes[cardId] ?? null;
    if (!env.useMockData) return { counts: null, mine };
    const counts = { ...baseCounts(cardId) };
    if (mine) counts[mine] += 1;
    return { counts, mine };
  }

  async vote(cardId: string, choice: DiffVote): Promise<void> {
    await delay(30);
    useDiffPollStore.getState().vote(cardId, choice);
  }
}
