import { useQuery } from '@tanstack/react-query';
import { queryClient } from '../data/network/queryClient';
import { useDailyLearningStore } from '../store/dailyLearningStore';
import { DAILY_MIN_CARDS } from '../constants/learning';
import { dateKey } from '../utils/dateKey';
import { learningQuotaRepository } from '../data/repositories';
import { resolveDailyQuota } from '../domain/models/LearningQuota';
import { DAILY_ASSIGNMENT_KEY } from './useDailyAssignment';
import { useCurrentLearningDay } from './useCurrentLearningDay';
import { logger } from '../utils/logger';
import { getSessionEpoch } from '../data/network/sessionEpoch';

/** 오늘의 진행 캐시 키 — 무효화할 곳이 흩어지지 않게 한 곳에 둔다. */
export const DAILY_QUOTA_KEY = 'learning-quota';

export interface DailyQuota {
  isRestDay: boolean;
  restDayName: string;
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
  const localDay = useCurrentLearningDay();
  const today = dateKey(new Date());
  const dayKey = useDailyLearningStore((s) => s.dayKey);
  const count = useDailyLearningStore((s) => s.newLearnedToday);
  // 어제 세어 둔 값은 오늘의 사용량이 아니다.
  const localUsed = dayKey === today ? count : 0;

  const { data } = useQuery({
    // 날짜를 키에 넣는다 — 오늘의 학습(useDailyAssignment)과 같은 이유다.
    // 이 앱은 하루 종일 켜 둔 채로 쓰이는데, 키가 날짜와 무관하면 자정을 넘겨도
    // **어제의 사용량**이 캐시에 남는다. 어제 상한을 다 채운 사람은 새벽에
    // "오늘 학습 완료"를 보고 학습 버튼이 닫힌 화면을 만난다 — 앱을 껐다 켜
    // 포그라운드 복귀가 일어나기 전까지 스스로 풀리지 않는다.
    queryKey: [DAILY_QUOTA_KEY, today],
    queryFn: () => learningQuotaRepository.getQuota(),
    // 상한은 초 단위로 다투는 값이 아니다. 다만 관리자가 바꾼 뒤 '오늘 안에'는
    // 닿아야 하므로, 화면을 다시 여는 정도의 주기로 확인한다.
    staleTime: 5 * 60_000,
    retry: 1,
  });

  // 합치는 규칙 자체는 도메인에 둔다 — 화면 밖에서 검사할 수 있어야 한다.
  const serverDay = data?.learningDay?.date === localDay.date ? data.learningDay : undefined;
  const isRestDay = !localDay.can_learn_new || serverDay?.can_learn_new === false;
  const quota = resolveDailyQuota(localUsed, data, DAILY_MIN_CARDS);
  return { ...quota, ...(isRestDay ? { limit: 0, remaining: 0, canLearn: false } : {}),
    isRestDay, restDayName: serverDay?.holiday_name || localDay.holiday_name || (localDay.reason === 'WEEKEND' ? '주말' : '휴무일') };
}

/**
 * 신규 카드 학습 완료를 기록(로컬 + 서버 보고). 화면에서 카드 완료 시 호출.
 *
 * 기록만 하고 캐시를 그대로 두면, 학습을 마치고 홈으로 돌아왔을 때 진행도가
 * 한동안 옛 값에 멈춰 있다("2/4" 를 다 풀었는데도 계속 2/4). 사용자는 방금 한
 * 일이 반영되지 않았다고 느끼고 다시 학습을 시작한다.
 */
export function recordNewLearned(count = 1): void {
  // 저장소를 통해 기록 — 목업은 로컬 스토어, 실서버는 로컬 반영 후 POST.
  const epoch = getSessionEpoch();
  void learningQuotaRepository.recordCompletion(count).then(() => {
    if (epoch !== getSessionEpoch()) return;
    void queryClient.invalidateQueries({ queryKey: [DAILY_QUOTA_KEY] });
    void queryClient.invalidateQueries({ queryKey: [DAILY_ASSIGNMENT_KEY] });
  }).catch(() => {
    if (epoch === getSessionEpoch()) logger.warn('learning.completion_failed');
  });
}
