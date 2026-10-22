import { buildLearningCompletion, type LearningGoals } from '../learningCompletion';
import { dateKey } from '../../utils/dateKey';
import { koreanDate } from '../../utils/workday';

const goal = (n = 5) => ({ targetCount: n, cardIds: Array.from({ length: n }, (_, i) => `c${i}`) });
function completed(dates: [number, number, number][], today = dates[dates.length - 1], rest: Record<string, string> = {}) {
  const goals: LearningGoals = {}, history: Record<string, string[]> = {};
  for (const [y, m, d] of dates) { const key = dateKey(koreanDate(y, m, d)); goals[key] = goal(); history[key] = goal().cardIds; }
  return buildLearningCompletion(goals, history, [], rest, koreanDate(...today).getTime() + 12 * 3_600_000);
}
it('requires the actual goal, not the old three-card minimum', () => {
  const now = koreanDate(2026, 9, 22).getTime();
  const result = buildLearningCompletion({ '2026-9-22': goal() }, { '2026-9-22': ['c0', 'c1', 'c2'] }, [], {}, now);
  expect(result.today).toEqual({ done: 3, target: 5, complete: false });
  expect(result.completed).toEqual([]);
  expect(result.streak).toBe(0);
});
it('counts only unique assigned cards and never invents a goal for old history', () => {
  const result = buildLearningCompletion({ '2026-9-22': goal(2) }, { '2026-9-22': ['c0', 'c0', 'other'], '2026-9-21': ['c0', 'c1', 'c2', 'c3', 'c4'] }, [], {}, koreanDate(2026, 9, 22).getTime());
  expect(result.today.done).toBe(1);
  expect(result.completed).toEqual([]);
});
it('connects Friday to Monday across the month boundary', () => {
  const result = completed([[2026, 6, 31], [2026, 7, 3]]);
  expect(result.streak).toBe(2);
  expect(result.connections).toEqual([['2026-6-31', '2026-7-3']]);
});
it('connects through the October holiday and weekend', () => {
  const result = completed([[2026, 9, 8], [2026, 9, 9], [2026, 9, 10], [2026, 9, 12]]);
  expect(result.completed).toEqual(['2026-9-8', '2026-9-12']);
  expect(result.streak).toBe(2);
});
it('reflects substitute holidays in the existing Korean holiday data', () => {
  const result = completed([[2027, 3, 30], [2027, 4, 3], [2027, 4, 4]]);
  expect(result.completed).toEqual(['2027-3-30', '2027-4-4']);
  expect(result.streak).toBe(2);
});
it('reflects server temporary holidays and excludes their records', () => {
  const result = completed([[2026, 9, 21], [2026, 9, 22], [2026, 9, 23]], [2026, 9, 23], { '2026-9-22': '임시공휴일' });
  expect(result.completed).toEqual(['2026-9-21', '2026-9-23']);
  expect(result.streak).toBe(2);
});
it('keeps the latest workday streak on a weekend without counting weekend activity', () => {
  const result = completed([[2026, 9, 23], [2026, 9, 24]], [2026, 9, 24]);
  expect(result.isRestDay).toBe(true);
  expect(result.completed).toEqual(['2026-9-23']);
  expect(result.streak).toBe(1);
});
it('an unfinished current day preserves yesterday, but an earlier missed workday breaks the run', () => {
  expect(completed([[2026, 9, 21]], [2026, 9, 22]).streak).toBe(1);
  expect(completed([[2026, 9, 20]], [2026, 9, 22]).streak).toBe(0);
});
it('handles one completed day and an empty history', () => {
  expect(completed([[2026, 9, 22]]).streak).toBe(1);
  expect(buildLearningCompletion({}, {}, [], {}, koreanDate(2026, 9, 22).getTime()).streak).toBe(0);
});
it('does not count zero targets or future/invalid dates', () => {
  const result = buildLearningCompletion({ '2026-9-22': goal(0), '2026-9-23': goal(1), '2026-9-32': goal(1) }, { '2026-9-23': ['c0'], '2026-9-32': ['c0'] }, [], {}, koreanDate(2026, 9, 22).getTime());
  expect(result.completed).toEqual([]);
});
it('handles the year boundary and a New Year holiday', () => {
  const result = completed([[2026, 11, 31], [2027, 0, 1], [2027, 0, 4]]);
  expect(result.streak).toBe(2);
  expect(result.connections).toEqual([['2026-11-31', '2027-0-4']]);
});
it('Korean midnight changes the active date independently of device timezone', () => {
  const before = buildLearningCompletion({}, {}, [], {}, Date.parse('2026-10-23T14:59:59Z'));
  const after = buildLearningCompletion({}, {}, [], {}, Date.parse('2026-10-23T15:00:00Z'));
  expect(before.todayKey).toBe('2026-9-23');
  expect(after.todayKey).toBe('2026-9-24');
  expect(after.isRestDay).toBe(true);
});
