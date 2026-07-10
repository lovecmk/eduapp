/** 캘린더/히스토리 공통 날짜 키 — 로컬 타임존 기준 `YYYY-M-D`(month 0-indexed). */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** 두 날짜의 자정 기준 일수 차이(a - b). */
export function dayDiff(a: Date, b: Date): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86_400_000);
}
