import { useDailyLearningStore } from '../store/dailyLearningStore';
import { DAILY_NEW_LIMIT } from '../constants/learning';
import { dateKey } from '../utils/dateKey';
import { learningQuotaRepository } from '../data/repositories';

export interface DailyQuota {
  limit: number;
  used: number;
  remaining: number;
  canLearn: boolean;
}

/**
 * 오늘의 신규 학습 할당량(반응형).
 * 로컬 스토어를 즉시 원천으로 삼아 완료 시 UI가 바로 갱신되게 한다.
 * (실서버 연동 시 learningQuotaRepository.getQuota() 로 초기 동기화 가능.)
 */
export function useDailyQuota(): DailyQuota {
  const dayKey = useDailyLearningStore((s) => s.dayKey);
  const count = useDailyLearningStore((s) => s.newLearnedToday);
  const used = dayKey === dateKey(new Date()) ? count : 0;
  const remaining = Math.max(0, DAILY_NEW_LIMIT - used);
  return { limit: DAILY_NEW_LIMIT, used, remaining, canLearn: remaining > 0 };
}

/** 신규 카드 학습 완료를 기록(로컬 + 서버 보고). 화면에서 카드 완료 시 호출. */
export function recordNewLearned(count = 1): void {
  // 저장소를 통해 기록 — 목업은 로컬 스토어, 실서버는 로컬 반영 후 POST.
  void learningQuotaRepository.recordCompletion(count);
}
