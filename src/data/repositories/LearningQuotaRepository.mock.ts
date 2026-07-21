import type { ILearningQuotaRepository } from '../../domain/repositories/ILearningQuotaRepository';
import type { LearningQuota } from '../../domain/models/LearningQuota';
import { DAILY_NEW_LIMIT } from '../../constants/learning';
import { useDailyLearningStore } from '../../store/dailyLearningStore';

/** 다음 자정(로컬) ISO — 상한 초기화 시각. */
function nextMidnightISO(): string {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.toISOString();
}

/**
 * 하루 학습 할당량 목업 — 로컬 스토어(dailyLearningStore)를 원천으로 사용.
 * 실 API 연동 전까지 오프라인에서도 상한이 정확히 집행되도록 한다.
 */
export class MockLearningQuotaRepository implements ILearningQuotaRepository {
  async getQuota(): Promise<LearningQuota> {
    const used = useDailyLearningStore.getState().usedToday();
    return {
      limit: DAILY_NEW_LIMIT,
      used,
      remaining: Math.max(0, DAILY_NEW_LIMIT - used),
      resetsAt: nextMidnightISO(),
    };
  }

  async recordCompletion(count: number): Promise<void> {
    useDailyLearningStore.getState().recordNewLearned(count);
  }
}
