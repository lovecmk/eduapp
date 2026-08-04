import { useQuery } from '@tanstack/react-query';
import { dailyAssignmentRepository } from '../data/repositories';
import { emptyAssignment, type DailyAssignment } from '../domain/models/DailyAssignment';
import { dateKey } from '../utils/dateKey';

export const DAILY_ASSIGNMENT_KEY = 'daily-assignment';

/**
 * 오늘의 학습 — 이 사람에게 오늘 배정된 3~5문제.
 *
 * ── 왜 날짜를 쿼리 키에 넣나 ────────────────────────────────────────────
 * 이 앱은 하루 종일 켜 둔 채로 쓰인다. 키가 날짜와 무관하면 자정을 넘겨도
 * 어제 목록이 그대로 남아, 이미 다 푼 문제를 다시 보여 주며 "오늘 할 일 없음"
 * 처럼 보인다. 날짜를 키에 넣으면 자정 이후 첫 조회에서 자연스럽게 갈린다.
 *
 * staleTime 이 짧은 이유는 진도(done) 때문이다. 문제를 풀면 서버의 done_count 가
 * 오르는데, 오래 캐시하면 화면의 "2/4" 가 멈춰 보인다.
 */
export function useDailyAssignment() {
  const day = dateKey(new Date());
  const query = useQuery({
    queryKey: [DAILY_ASSIGNMENT_KEY, day],
    queryFn: () => dailyAssignmentRepository.get(),
    staleTime: 60_000,
    retry: 1,
  });

  // 화면이 `data?.` 를 반복하지 않도록 항상 값이 있는 형태로 준다.
  const assignment: DailyAssignment = query.data ?? emptyAssignment(day);
  return { ...query, assignment };
}
