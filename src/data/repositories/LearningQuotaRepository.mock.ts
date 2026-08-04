import type { ILearningQuotaRepository } from '../../domain/repositories/ILearningQuotaRepository';
import type { LearningQuota } from '../../domain/models/LearningQuota';
import { useDailyLearningStore } from '../../store/dailyLearningStore';
import { MockDailyAssignmentRepository } from './DailyAssignmentRepository.mock';

/** 다음 자정(로컬) ISO — 상한 초기화 시각. */
function nextMidnightISO(): string {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.toISOString();
}

/**
 * 하루 학습 할당량 목업.
 *
 * **상한은 오늘의 편성에서 온다** — 앱 상수(3)를 그대로 쓰면, 쉬운 날 5문제를
 * 배정받고도 화면에는 "3/3 · 완료"가 떠서 남은 두 문제를 볼 수 없게 된다.
 * 같은 규칙으로 만든 편성의 장수가 곧 오늘의 상한이다(서버도 같은 방식).
 *
 * 진행 수는 로컬 스토어가 원천이다 — 방금 푼 것이 즉시 반영되어야 한다.
 */
export class MockLearningQuotaRepository implements ILearningQuotaRepository {
  private readonly plans = new MockDailyAssignmentRepository();

  async getQuota(): Promise<LearningQuota> {
    const assignment = await this.plans.get();
    // 후보가 모자라 배정이 비었을 때만 목표를 쓴다 — 0 을 상한으로 주면
    // 앱이 '오늘 학습 끝'으로 오해한다.
    const limit = assignment.cards.length || assignment.targetCount;
    const used = Math.max(useDailyLearningStore.getState().usedToday(), assignment.doneCount);
    return {
      limit,
      used,
      remaining: Math.max(0, limit - used),
      resetsAt: nextMidnightISO(),
    };
  }

  async recordCompletion(count: number): Promise<void> {
    useDailyLearningStore.getState().recordNewLearned(count);
  }
}
