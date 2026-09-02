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

// 대한민국 공휴일 — 양력 고정일 + 음력/대체공휴일(해마다 갱신이 필요하다).
const SOLAR_HOLIDAYS = new Set(['1-1', '3-1', '5-5', '6-6', '8-15', '10-3', '10-9', '12-25']);
const LUNAR_HOLIDAYS: Record<number, string[]> = {
  2025: ['1-27', '1-28', '1-29', '1-30', '5-5', '10-6', '10-7', '10-8', '10-9'],
  2026: ['2-16', '2-17', '2-18', '5-24', '5-25', '9-24', '9-25', '9-26'],
};

/** 해당 날짜가 공휴일인지. month0 은 0-based 월. */
export function isHoliday(year: number, month0: number, day: number): boolean {
  const md = `${month0 + 1}-${day}`;
  return SOLAR_HOLIDAYS.has(md) || (LUNAR_HOLIDAYS[year] ?? []).includes(md);
}

/** 근무일(월~금 · 공휴일 제외)인가. */
export function isWorkday(date: Date): boolean {
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return false;
  return !isHoliday(date.getFullYear(), date.getMonth(), date.getDate());
}
