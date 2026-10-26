import type { LearningCard } from './models/LearningCard';
import { MASTERED_BOX, normalizeGrade, type SrsCardState } from './srs';
import { dateKey, startOfDay } from '../utils/dateKey';
import { koreanDate } from '../utils/workday';
import { DAILY_REVIEW_CARDS } from '../constants/learning';
import type { DailyAssignment } from './models/DailyAssignment';

/** Persisted calendar keys use a zero-based month. Reject rolled-over/invalid dates. */
export function calendarDate(key: string): Date | null {
  if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(key)) return null;
  const [year, month, day] = key.split('-').map(Number);
  const date = koreanDate(year, month, day);
  return Number.isFinite(date.getTime()) && dateKey(date) === key ? date : null;
}

/** Calendar cells and date details share one snapshot, independent of device timezone. */
export function buildLearningCalendar(
  cards: LearningCard[],
  states: Record<string, SrsCardState | undefined>,
  history: Record<string, string[]>,
  now = Date.now(),
  assignment?: DailyAssignment | null,
) {
  const today = startOfDay(new Date(now)).getTime();
  const historyByDate: Record<string, string[]> = {};
  for (const [key, ids] of Object.entries(history)) {
    const date = calendarDate(key);
    if (!date || date.getTime() > today || !Array.isArray(ids)) continue;
    historyByDate[key] = [...new Set(ids.filter(id => typeof id === 'string' && id.length > 0))];
  }

  const dueByDate: Record<string, LearningCard[]> = {};
  const recordedIds = new Set(Object.values(historyByDate).flat());
  for (const card of new Map(cards.map(card => [card.id, card])).values()) {
    const state = states[card.id];
    if (!state || !(state.reps > 0 || recordedIds.has(card.id)) || !Number.isFinite(state.dueAt) || state.dueAt <= 0) continue;
    const grade = normalizeGrade(state.lastGrade);
    // Under the personal review policy KNOWN cards have no pending review.
    if ((state.box >= MASTERED_BOX || card.status === 'mastered') && grade !== 'again' && grade !== 'hard') continue;
    const date = startOfDay(new Date(state.dueAt)).getTime();
    if (!Number.isFinite(date)) continue;
    // Pending reviews remain available today; a past date only describes actual history.
    const key = dateKey(new Date(Math.max(today, date)));
    (dueByDate[key] ??= []).push(card);
  }
  for (const [key, cards] of Object.entries(dueByDate)) {
    cards.sort((a, b) => states[a.id]!.dueAt - states[b.id]!.dueAt || a.id.localeCompare(b.id));
    dueByDate[key] = cards.slice(0, DAILY_REVIEW_CARDS);
  }
  // Today's actual server allocation wins over a locally predicted backlog.
  if (assignment !== undefined) {
    const todayKey = dateKey(new Date(today));
    delete dueByDate[todayKey];
    if (assignment?.day === todayKey) {
      const available = new Set(cards.map(card => card.id));
      const completed = new Set(historyByDate[todayKey] ?? []);
      const selected = new Set<string>();
      const reviews = assignment.cards.filter(item => {
        if (item.kind !== 'review' || item.done || completed.has(item.card.id) || !available.has(item.card.id) || selected.has(item.card.id)) return false;
        selected.add(item.card.id);
        return true;
      }).slice(0, DAILY_REVIEW_CARDS).map(item => item.card);
      if (reviews.length) dueByDate[todayKey] = reviews;
    }
  }
  return { historyByDate, dueByDate };
}
