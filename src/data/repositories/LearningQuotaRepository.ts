import type { ILearningQuotaRepository } from '../../domain/repositories/ILearningQuotaRepository';
import type { LearningQuota } from '../../domain/models/LearningQuota';
import { DAILY_MIN_CARDS } from '../../constants/learning';
import { apiClient } from '../network/ApiClient';
import { useDailyLearningStore } from '../../store/dailyLearningStore';
import { dateKey, startOfDay } from '../../utils/dateKey';
import type { LearningDay } from '../../utils/workday';
import { assertSessionEpoch, getSessionEpoch } from '../network/sessionEpoch';

interface QuotaDTO {
  learning_day?: LearningDay;
  limit?: number;
  used?: number;
  resets_at?: string;
}

/**
 * 실서버 하루 학습 할당량 저장소.
 *  · getQuota()       → GET  /inner/api/v1/learning/quota
 *  · recordCompletion → POST /inner/api/v1/learning/complete
 *
 * 서버가 오늘 학습 수의 권위를 갖는다. 로컬 스토어도 함께 갱신해 오프라인/즉시 UI에
 * 일관성을 유지한다.
 */
export class LearningQuotaRepository implements ILearningQuotaRepository {
  async getQuota(): Promise<LearningQuota> {
    const dto = await apiClient.get<QuotaDTO>('/inner/api/v1/learning/quota');
    const limit = dto.limit ?? DAILY_MIN_CARDS;
    const used = dto.used ?? 0;
    return {
      learningDay: dto.learning_day,
      limit,
      used,
      remaining: Math.max(0, limit - used),
      resetsAt: dto.resets_at ?? new Date(startOfDay(new Date()).getTime() + 86_400_000).toISOString(),
    };
  }

  async recordCompletion(count: number): Promise<void> {
    // Temporary failures are durably queued; missing routes and invalid inputs remain errors.
    const epoch = getSessionEpoch();
    const completedAt = new Date();
    const key = `learning-complete:${dateKey(completedAt)}:${completedAt.getTime()}:${count}`;
    await apiClient.postDurable('/inner/api/v1/learning/complete', { count, completed_at: completedAt.toISOString() }, key);
    assertSessionEpoch(epoch);
    // A slow/queued write can finish after midnight. Never consume the new day's quota.
    if (dateKey(completedAt) === dateKey(new Date())) useDailyLearningStore.getState().recordNewLearned(count);
  }
}
