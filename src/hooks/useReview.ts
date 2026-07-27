import { useCallback, useEffect, useMemo } from 'react';
import { useAllCards, useMarkCard } from './useCards';
import { useSrsStore } from '../store/srsStore';
import { type Grade } from '../domain/srs';
import { buildReviewPlan, REVIEW_SESSION_CAP, type UpcomingDay } from '../domain/reviewPlan';
import type { LearningCard } from '../domain/models/LearningCard';

/**
 * 한 번의 복습 세션 최대 카드 수 — 마이크로러닝 부담 최소화.
 * 값은 도메인이 갖고 있고 여기서는 이름만 잇는다(두 곳에 적으면 갈라진다).
 */
export const SESSION_CAP = REVIEW_SESSION_CAP;

// UpcomingDay 는 도메인(reviewPlan)으로 옮겼다. 기존 호출부를 위해 재수출한다.
export type { UpcomingDay };

export function useReview() {
  const { data: allCards = [], isLoading, error, refetch } = useAllCards();
  const cardsState = useSrsStore((s) => s.cards);
  const ensureSeeded = useSrsStore((s) => s.ensureSeeded);
  const gradeInStore = useSrsStore((s) => s.grade);
  const markCard = useMarkCard();

  useEffect(() => {
    if (allCards.length > 0) ensureSeeded(allCards.map((c) => c.id));
  }, [allCards, ensureSeeded]);

  const now = Date.now();

  /**
   * 오늘의 복습 계획 — 무엇을 어떤 순서로 볼지는 도메인(reviewPlan)이 정한다.
   *
   * 여기서 다시 계산하지 않는 것이 중요하다. 복습 화면은 "지금 복습할 12장"이라고
   * 약속하는데, 세션이 그와 다른 순서·개수로 카드를 내놓으면 그 약속이 깨진다.
   * 같은 규칙을 두 곳에 적어 두면 반드시 한쪽만 바뀌어 어긋난다.
   */
  const plan = useMemo(
    () => buildReviewPlan(allCards, cardsState, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allCards, cardsState],
  );

  const dueCards = plan.queue;

  /**
   * 약점 카드 — 기억 강도가 낮거나(박스 0~1) 자주 잊은(lapses≥1) 카드.
   * 교육적 원리: 취약 지점을 집중 반복하면 학습 효율이 크게 오른다.
   */
  const weakCards = useMemo(() => {
    return allCards
      .filter((card) => {
        const st = cardsState[card.id];
        return st && card.status !== 'mastered' && (st.box <= 1 || st.lapses >= 1);
      })
      .sort((a, b) => {
        const sa = cardsState[a.id]!;
        const sb = cardsState[b.id]!;
        return sb.lapses - sa.lapses || sa.box - sb.box;
      })
      .slice(0, SESSION_CAP);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCards, cardsState]);

  const dueTodayCount = plan.overdue + plan.dueToday;

  /** 향후 7일 복습 예정 분포(계획이 이미 계산해 둔 값). */
  const upcoming = plan.upcoming;

  /** 채점 → SRS 갱신 + 백엔드 상태 동기화. */
  const gradeCard = useCallback((card: LearningCard, grade: Grade) => {
    const nextBox = gradeInStore(card.id, grade);
    const status =
      grade === 'again' || grade === 'hard'
        ? 'learning'
        : nextBox >= 4
          ? 'mastered'
          : grade === 'easy' && nextBox >= 3
            ? 'mastered'
            : 'learning';
    if (card.status !== status) markCard.mutate({ id: card.id, status });
  }, [gradeInStore, markCard]);

  const nextDueAt = plan.nextDueAt;

  return { allCards, plan, dueCards, weakCards, dueTodayCount, upcoming, nextDueAt, gradeCard, isLoading, error, refetch };
}
