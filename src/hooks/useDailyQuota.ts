import { useQuery } from '@tanstack/react-query';
import { useDailyLearningStore } from '../store/dailyLearningStore';
import { DAILY_NEW_LIMIT } from '../constants/learning';
import { dateKey } from '../utils/dateKey';
import { learningQuotaRepository } from '../data/repositories';
import { resolveDailyQuota } from '../domain/models/LearningQuota';

export interface DailyQuota {
  limit: number;
  used: number;
  remaining: number;
  canLearn: boolean;
}

/**
 * 오늘의 신규 학습 할당량(반응형).
 *
 * 서버 할당량과 로컬 진행을 합쳐서 준다(합치는 규칙은 domain/models/LearningQuota).
 *
 * 예전에는 앱 상수만 읽었고 `getQuota()` 를 부르는 곳이 아예 없었다 — 서버와
 * 콘솔에 상한 기능이 다 갖춰져 있는데도 **바꿔 봐야 앱에서는 아무 일도
 * 일어나지 않았다.** 이 훅이 그 두 쪽을 잇는 유일한 지점이다.
 */
export function useDailyQuota(): DailyQuota {
  const dayKey = useDailyLearningStore((s) => s.dayKey);
  const count = useDailyLearningStore((s) => s.newLearnedToday);
  const localUsed = dayKey === dateKey(new Date()) ? count : 0;

  const { data } = useQuery({
    queryKey: ['learning-quota'],
    queryFn: () => learningQuotaRepository.getQuota(),
    // 상한은 초 단위로 다투는 값이 아니다. 다만 관리자가 바꾼 뒤 '오늘 안에'는
    // 닿아야 하므로, 화면을 다시 여는 정도의 주기로 확인한다.
    staleTime: 5 * 60_000,
    retry: 1,
  });

  // 합치는 규칙 자체는 도메인에 둔다 — 화면 밖에서 검사할 수 있어야 한다.
  return resolveDailyQuota(localUsed, data, DAILY_NEW_LIMIT);
}

/** 신규 카드 학습 완료를 기록(로컬 + 서버 보고). 화면에서 카드 완료 시 호출. */
export function recordNewLearned(count = 1): void {
  // 저장소를 통해 기록 — 목업은 로컬 스토어, 실서버는 로컬 반영 후 POST.
  void learningQuotaRepository.recordCompletion(count);
}
