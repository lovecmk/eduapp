import type { ILearningQuotaRepository } from '../../domain/repositories/ILearningQuotaRepository';
import type { LearningQuota } from '../../domain/models/LearningQuota';
import { DAILY_MIN_CARDS } from '../../constants/learning';
import { apiClient } from '../network/ApiClient';
import { useDailyLearningStore } from '../../store/dailyLearningStore';
import { dateKey } from '../../utils/dateKey';

interface QuotaDTO {
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
      limit,
      used,
      remaining: Math.max(0, limit - used),
      resetsAt: dto.resets_at ?? new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
    };
  }

  async recordCompletion(count: number): Promise<void> {
    // Temporary failures are durably queued; missing routes and invalid inputs remain errors.
    const key = `learning-complete:${dateKey(new Date())}:${Date.now()}:${count}`;
    await apiClient.postDurable('/inner/api/v1/learning/complete', { count }, key);
    useDailyLearningStore.getState().recordNewLearned(count);
  }
}
