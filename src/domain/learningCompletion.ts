import { calendarDate } from './learningCalendar';
import { dateKey, startOfDay } from '../utils/dateKey';
import { isWorkday } from '../utils/workday';
import type { LearningCard } from './models/LearningCard';

export interface LearningGoal { targetCount: number; cardIds: string[] }
export type LearningGoals = Record<string, LearningGoal>;

export function learningGoal(value: unknown): LearningGoal | null {
  if (!value || typeof value !== 'object') return null;
  const goal = value as LearningGoal;
  if (!Number.isSafeInteger(goal.targetCount) || goal.targetCount < 0 || !Array.isArray(goal.cardIds) || goal.cardIds.some(id => typeof id !== 'string' || !id)) return null;
  return { targetCount: goal.targetCount, cardIds: [...new Set(goal.cardIds)] };
}

/** All completion metrics use actual daily assignments, never attendance or a guessed minimum. */
export function buildLearningCompletion(
  goals: LearningGoals,
  history: Record<string, string[]>,
  cards: LearningCard[],
  restDays: Record<string, string> = {},
  now = Date.now(),
) {
  const today = startOfDay(new Date(now));
  const todayKey = dateKey(today);
  const canLearn = (date: Date) => isWorkday(date) && !Object.hasOwn(restDays, dateKey(date));
  const days: Record<string, { target: number; done: number; complete: boolean }> = {};
  const completed: string[] = [];
  for (const [key, raw] of Object.entries(goals)) {
    const date = calendarDate(key), goal = learningGoal(raw);
    if (!date || !goal || date > today || !canLearn(date)) continue;
    const learned = new Set(Array.isArray(history[key]) ? history[key] : []);
    const done = goal.cardIds.filter(id => learned.has(id)).length;
    const complete = goal.targetCount > 0 && done >= goal.targetCount;
    days[key] = { target: goal.targetCount, done, complete };
    if (complete) completed.push(key);
  }
  completed.sort((a, b) => calendarDate(a)!.getTime() - calendarDate(b)!.getTime());
  const completedSet = new Set(completed);
  const previousWorkday = (date: Date) => {
    let at = date.getTime() - 86_400_000;
    while (!canLearn(new Date(at))) at -= 86_400_000;
    return new Date(at);
  };
  const connections: [string, string][] = [];
  let bestStreak = 0, run = 0, previous: string | undefined;
  for (const key of completed) {
    if (previous && dateKey(previousWorkday(calendarDate(key)!)) === previous) {
      run++;
      connections.push([previous, key]);
    } else run = 1;
    bestStreak = Math.max(bestStreak, run);
    previous = key;
  }
  let cursor = canLearn(today) ? today : previousWorkday(new Date(today.getTime() + 86_400_000));
  // Today's unfinished goal does not erase the streak earned through yesterday.
  if (canLearn(today) && !completedSet.has(todayKey)) cursor = previousWorkday(today);
  let streak = 0;
  while (completedSet.has(dateKey(cursor))) { streak++; cursor = previousWorkday(cursor); }
  return {
    days, completed, completedSet, connections, streak, bestStreak, todayKey,
    today: days[todayKey] ?? { target: 0, done: 0, complete: false },
    isRestDay: !canLearn(today),
    masteredCards: cards.filter(card => card.status === 'mastered').length,
  };
}

export type LearningCompletion = ReturnType<typeof buildLearningCompletion>;
