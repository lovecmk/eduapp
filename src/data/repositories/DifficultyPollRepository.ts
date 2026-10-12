import type { IDifficultyPollRepository } from '../../domain/repositories/IDifficultyPollRepository';
import type { DiffVote, PollSummary } from '../../domain/models/DifficultyPoll';
import { isDiffVote } from '../../domain/models/DifficultyPoll';
import { apiClient } from '../network/ApiClient';

interface PollDTO {
  easy?: number;
  normal?: number;
  hard?: number;
  mine?: string | null;
}

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0);

/**
 * 체감 난이도(실서버) — docs/BACKEND_TODO §3.
 *  · GET  /inner/api/v1/cards/:cardId/difficulty   → { easy, normal, hard, mine }
 *  · POST /inner/api/v1/cards/:cardId/difficulty   { vote }  (멱등키, 다시 투표하면 바뀐다)
 */
export class DifficultyPollRepository implements IDifficultyPollRepository {
  async get(cardId: string): Promise<PollSummary> {
    const dto = await apiClient.get<PollDTO>(`/inner/api/v1/cards/${encodeURIComponent(cardId)}/difficulty`);
    return {
      counts: { easy: n(dto?.easy), normal: n(dto?.normal), hard: n(dto?.hard) },
      mine: isDiffVote(dto?.mine) ? dto.mine : null,
    };
  }

  async vote(cardId: string, choice: DiffVote): Promise<void> {
    await apiClient.postDurable(
      `/inner/api/v1/cards/${encodeURIComponent(cardId)}/difficulty`,
      { vote: choice },
    );
  }
}
