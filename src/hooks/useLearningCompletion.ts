import { useMemo } from 'react';
import { buildLearningCompletion } from '../domain/learningCompletion';
import { useSrsStore } from '../store/srsStore';
import { useAllCards } from './useCards';
import { useDailyAssignment } from './useDailyAssignment';
import { useLearningDay } from './useLearningDay';

export function useLearningCompletion() {
  const today = useLearningDay();
  const { data: cards = [] } = useAllCards();
  const { assignment } = useDailyAssignment();
  const goals = useSrsStore(s => s.dailyGoals);
  const history = useSrsStore(s => s.history);
  const restDays = useSrsStore(s => s.restDays);
  return useMemo(() => {
    const actual = { ...goals };
    const recorded = { ...history };
    if (assignment.day === `${Number(today.date.slice(0, 4))}-${Number(today.date.slice(5, 7)) - 1}-${Number(today.date.slice(8, 10))}` && assignment.cards.length > 0) {
      actual[assignment.day] = { targetCount: assignment.targetCount, cardIds: assignment.cards.map(item => item.card.id) };
      recorded[assignment.day] = [...new Set([...(history[assignment.day] ?? []), ...assignment.cards.filter(item => item.done).map(item => item.card.id)])];
    }
    return buildLearningCompletion(actual, recorded, cards, restDays);
  }, [goals, history, restDays, cards, assignment, today.date]);
}
