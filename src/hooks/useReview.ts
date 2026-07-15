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

  /**
   * 지금 복습 예정(due)인 카드 — 자동 우선순위 정렬.
   * 오래 방치된(예정일이 오래된) 카드 우선, 같으면 반복 오답(lapses 많은) 카드 우선.
   */
  const dueCards = useMemo(() => {
    return allCards
      .filter((card) => {
        const st = cardsState[card.id];
        return st ? isDue(st, now) : false;
      })
      .sort((a, b) => {
        const sa = cardsState[a.id];
        const sb = cardsState[b.id];
        return (sa?.dueAt ?? 0) - (sb?.dueAt ?? 0) || (sb?.lapses ?? 0) - (sa?.lapses ?? 0);
      })
      .slice(0, SESSION_CAP);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCards, cardsState]);

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

  return { allCards, dueCards, weakCards, dueTodayCount, upcoming, nextDueAt, gradeCard, isLoading, error, refetch };
}
