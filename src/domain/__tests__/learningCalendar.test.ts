import { buildLearningCalendar, calendarDate } from '../learningCalendar';
import { initialState, type SrsCardState } from '../srs';
import type { LearningCard } from '../models/LearningCard';

const NOW = Date.parse('2026-10-24T03:00:00Z'); // Korean Saturday.
const card = (id: string, status = 'learning') => ({ id, status } as LearningCard);
const state = (due: string, extra: Partial<SrsCardState> = {}): SrsCardState => ({
  ...initialState(NOW), reps: 1, lastGrade: 'again', lastReviewedAt: NOW - 5 * 86_400_000,
  dueAt: Date.parse(due), ...extra,
});

it('keeps genuine Saturday/Sunday review dates without enabling new learning', () => {
  const result = buildLearningCalendar([card('sat'), card('sun')], {
    sat: state('2026-10-24T00:00:00+09:00'), sun: state('2026-10-25T00:00:00+09:00'),
  }, {}, NOW);
  expect(result.dueByDate['2026-9-24']?.map(c => c.id)).toEqual(['sat']);
  expect(result.dueByDate['2026-9-25']?.map(c => c.id)).toEqual(['sun']);
});

it('shows unreviewed past schedules today, never as pending on a past date', () => {
  const result = buildLearningCalendar([card('late'), card('today')], {
    late: state('2026-10-18T00:00:00+09:00'), today: state('2026-10-24T00:00:00+09:00'),
  }, {}, NOW);
  expect(result.dueByDate['2026-9-18']).toBeUndefined();
  expect(result.dueByDate['2026-9-24']?.map(c => c.id)).toEqual(['late', 'today']);
});

it('counts the full backlog rather than the two-card daily allocation, without duplicate cards', () => {
  const cards = Array.from({ length: 10 }, (_, index) => card(`due-${index}`));
  const states = Object.fromEntries(cards.map((card, index) => [card.id, state(index < 7 ? '2026-10-21T00:00:00+09:00' : '2026-10-24T00:00:00+09:00')]));
  const result = buildLearningCalendar([...cards, cards[0]], states, {}, NOW);
  expect(result.dueByDate['2026-9-24']).toHaveLength(10);
  expect(result.dueByDate['2026-9-21']).toBeUndefined();
});

it('excludes unstudied, invalid, unavailable and completed schedules', () => {
  const cards = [card('new', 'new'), card('untouched'), card('invalid'), card('done', 'mastered'), card('zero'), card('missing-state')];
  const due = '2026-10-24T00:00:00+09:00';
  const result = buildLearningCalendar(cards, {
    new: state(due, { reps: 0 }), untouched: state(due, { reps: 0 }), invalid: state(due, { dueAt: NaN }), zero: state(due, { dueAt: 0 }),
    done: state(due, { box: 4, lastGrade: 'good' }), unavailable: state(due),
  }, {}, NOW);
  expect(result.dueByDate).toEqual({});
});

it('uses the latest local review even if the card list still says mastered', () => {
  const result = buildLearningCalendar([card('again', 'mastered')], {
    again: state('2026-10-25T00:00:00+09:00'),
  }, {}, NOW);
  expect(result.dueByDate['2026-9-25']?.[0]?.id).toBe('again');
});

it('deduplicates history and preserves unavailable-card counts without inventing future records', () => {
  const result = buildLearningCalendar([], {}, {
    '2026-9-23': ['one', 'one', 'unavailable', ''], '2026-9-25': ['future'],
    '2026-9-32': ['invalid'], '2026-10-0': ['invalid'], 'invalid': ['invalid'],
  }, NOW);
  expect(result.historyByDate).toEqual({ '2026-9-23': ['one', 'unavailable'] });
});

it('moves pending reviews at Korean midnight, including month/year transitions', () => {
  const cards = [card('one'), card('one')];
  const states = { one: state('2026-12-31T23:00:00+09:00') };
  const before = buildLearningCalendar(cards, states, {}, Date.parse('2026-12-31T14:59:59Z'));
  const after = buildLearningCalendar(cards, states, {}, Date.parse('2026-12-31T15:00:00Z'));
  expect(before.dueByDate['2026-11-31']).toHaveLength(1);
  expect(after.dueByDate['2027-0-1']).toHaveLength(1);
  expect(after.dueByDate['2026-11-31']).toBeUndefined();
});

it('uses the Korean date of the due timestamp, not the device date', () => {
  const result = buildLearningCalendar([card('one')], { one: state('2026-10-24T15:00:00Z') }, {}, NOW);
  expect(result.dueByDate['2026-9-25']).toHaveLength(1);
});

it.each(['2026-1-29', '2026-12-1', '2026-0-0', '2026-00-1', '2026-9-32', 'not-a-date'])('rejects invalid or noncanonical date %s', key => {
  expect(calendarDate(key)).toBeNull();
});

it('accepts leap day and year boundaries', () => {
  expect(calendarDate('2028-1-29')?.toISOString()).toBe('2028-02-28T15:00:00.000Z');
  expect(calendarDate('2027-0-1')?.toISOString()).toBe('2026-12-31T15:00:00.000Z');
});
