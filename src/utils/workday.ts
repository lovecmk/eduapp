/**
 * 근무일 판정 — 이 앱에서 '학습한 날'을 세는 단위.
 *
 * 대상 사용자는 현장 근로자이고, 이 앱의 학습은 근무일에 일어난다. 그래서 달력도
 * 이어달리기도 **월~금 중 공휴일이 아닌 날**만 센다(범례: '토·일·공휴일 제외').
 * 금요일에 하고 월요일에 이은 사람은 한 번도 거른 적이 없다.
 *
 * 이 판정이 두 곳에 흩어져 있으면 화면이 서로 다른 말을 한다 — 실제로 그랬다.
 * 달력은 주말에 띠를 이어 그리는데(inStreak) 그 옆의 '연속 N일' 숫자는 달력일로
 * 세고 있어, 매주 월요일마다 1 로 되돌아갔다. 한 화면 안에서 띠는 이어져 있는데
 * 숫자는 끊긴 셈이라, 둘 중 어느 쪽도 믿기 어려워진다.
 */

import calendar from '../constants/learning-holidays.json';
const holidays: Record<string, string> = calendar.holidays;
const KST_OFFSET = 9 * 3_600_000;

export interface LearningDay {
  date: string;
  can_learn_new: boolean;
  can_review: boolean;
  reason: string;
  holiday_name: string;
}

/** Civil date in Korea, independent of the phone's timezone. month0 is zero-based. */
export function koreanDate(year: number, month0: number, day: number): Date {
  return new Date(Date.UTC(year, month0, day) - KST_OFFSET);
}

export function holidayName(year: number, month0: number, day: number): string {
  const iso = `${year}-${String(month0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return holidays[iso] ?? '';
}

export function learningDay(at = new Date()): LearningDay {
  const civil = new Date(at.getTime() + KST_OFFSET);
  const name = holidayName(civil.getUTCFullYear(), civil.getUTCMonth(), civil.getUTCDate());
  const weekend = civil.getUTCDay() === 0 || civil.getUTCDay() === 6;
  return { date: civil.toISOString().slice(0, 10), can_learn_new: !name && !weekend,
    can_review: true, reason: name ? 'HOLIDAY' : weekend ? 'WEEKEND' : '', holiday_name: name };
}

/** 해당 날짜가 공휴일인지. month0 은 0-based 월. */
export function isHoliday(year: number, month0: number, day: number): boolean {
  return holidayName(year, month0, day) !== '';
}

/** 근무일(월~금 · 공휴일 제외)인가. */
export function isWorkday(date: Date): boolean {
  return learningDay(date).can_learn_new;
}

export function canStudyCard(status: string, reps = 0, at = new Date()): boolean {
  return hasStudiedCard(status, reps) || isWorkday(at);
}

export function hasStudiedCard(status: string, reps = 0): boolean {
  return reps > 0 || status === 'learning' || status === 'mastered';
}
