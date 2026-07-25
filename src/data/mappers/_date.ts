// 매퍼 공용 날짜 파서 — 서버 문자열을 Date 로 변환하되, 파싱 불가한 값은 걸러낸다.
// `new Date('garbage')` 는 예외를 던지지 않고 'Invalid Date'(getTime()===NaN)를 만들어,
// 이후 복습 예정일 비교(SRS)나 UI 표기를 NaN 으로 조용히 오염시킨다. 여기서 한 번에 막는다.

/** 파싱 가능한 날짜면 Date, 아니면 null. (null/undefined/빈 문자열 → null) */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** parseDate 와 같되, 실패 시 지정한 대체 Date 를 반환한다(항상 유효한 Date 필요할 때). */
export function parseDateOr(value: string | null | undefined, fallback: Date): Date {
  return parseDate(value) ?? fallback;
}
