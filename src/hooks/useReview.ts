import { useCallback, useEffect, useMemo } from 'react';
import { useAllCards, useMarkCard } from './useCards';
import { useSrsStore } from '../store/srsStore';
import { initialState, isDue, type Grade } from '../domain/srs';
import { dayDiff } from '../utils/dateKey';
import type { LearningCard } from '../domain/models/LearningCard';

/** 한 번의 복습 세션 최대 카드 수 — 마이크로러닝 부담 최소화. */
export const SESSION_CAP = 20;

export interface UpcomingDay {
  date: Date;
  count: number;
  isToday: boolean;
}

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

  /** 지금 복습 예정(due)인 카드 — 마감 임박 순, 세션 상한 적용. */
  const dueCards = useMemo(() => {
    return allCards
      .filter((card) => {
        const st = cardsState[card.id];
        return st ? isDue(st, now) : false;
      })
      .sort((a, b) => (cardsState[a.id]?.dueAt ?? 0) - (cardsState[b.id]?.dueAt ?? 0))
      .slice(0, SESSION_CAP);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCards, cardsState]);

  const dueTodayCount = useMemo(
    () => allCards.filter((c) => { const s = cardsState[c.id]; return s && isDue(s, now); }).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allCards, cardsState],
  );

  /** 향후 7일 복습 예정 분포. */
  const upcoming = useMemo<UpcomingDay[]>(() => {
    const today = new Date();
    const days: UpcomingDay[] = Array.from({ length: 7 }).map((_, i) => ({
      date: new Date(today.getFullYear(), today.getMonth(), today.getDate() + i),
      count: 0,
      isToday: i === 0,
    }));
    for (const card of allCards) {
      const st = cardsState[card.id];
      if (!st) continue;
      const diff = dayDiff(new Date(st.dueAt), today);
      if (diff <= 0) days[0].count += 1; // 오늘/지연분은 오늘로
      else if (diff < 7) days[diff].count += 1;
    }
    return days;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCards, cardsState]);

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

  const nextDueAt = useMemo(() => {
    const future = allCards
      .map((c) => cardsState[c.id]?.dueAt ?? initialState().dueAt)
      .filter((t) => t > now)
      .sort((a, b) => a - b);
    return future[0] ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCards, cardsState]);

  return { allCards, dueCards, dueTodayCount, upcoming, nextDueAt, gradeCard, isLoading, error, refetch };
}
