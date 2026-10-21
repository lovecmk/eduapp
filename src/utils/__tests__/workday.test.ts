import { canStudyCard, isWorkday, koreanDate, learningDay, holidayName } from '../workday';

it('blocks new cards at Korean Friday/Saturday midnight, including foreign devices', () => {
  expect(isWorkday(new Date('2026-10-23T14:59:59Z'))).toBe(true);
  const saturday = new Date('2026-10-23T15:00:00Z');
  expect(learningDay(saturday)).toMatchObject({ date: '2026-10-24', can_learn_new: false, can_review: true });
  expect(canStudyCard('new', 0, saturday)).toBe(false);
  expect(canStudyCard('learning', 0, saturday)).toBe(true);
  expect(canStudyCard('new', 1, saturday)).toBe(true);
  expect(isWorkday(new Date('2026-10-25T15:00:00Z'))).toBe(true);
});

it.each([[2026, 4, 1], [2026, 6, 17], [2026, 5, 3], [2026, 7, 17], [2027, 1, 9], [2027, 6, 19]])('includes public, substitute and election holidays (%i-%i-%i)', (year, month0, day) => {
  expect(holidayName(year, month0, day)).not.toBe('');
  expect(isWorkday(koreanDate(year, month0, day))).toBe(false);
  expect(canStudyCard('mastered', 1, koreanDate(year, month0, day))).toBe(true);
});

it('does not invent substitutes for Saturday Chuseok or Sunday Memorial Day', () => {
  expect(isWorkday(koreanDate(2026, 8, 28))).toBe(true);
  expect(isWorkday(koreanDate(2027, 5, 7))).toBe(true);
});
