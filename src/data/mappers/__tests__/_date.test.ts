import { parseDate, parseDateOr } from '../_date';

describe('parseDate', () => {
  it('유효한 ISO 문자열을 Date 로 변환한다', () => {
    const d = parseDate('2026-01-15T09:30:00.000Z');
    expect(d).toBeInstanceOf(Date);
    expect(d?.toISOString()).toBe('2026-01-15T09:30:00.000Z');
  });

  it.each([null, undefined, ''])('빈 값(%p)은 null', (v) => {
    expect(parseDate(v as string | null | undefined)).toBeNull();
  });

  it.each(['garbage', 'not-a-date', '2026-13-45'])('파싱 불가한 문자열(%p)은 null (Invalid Date 방지)', (v) => {
    expect(parseDate(v)).toBeNull();
  });
});

describe('parseDateOr', () => {
  it('유효하면 파싱된 Date', () => {
    expect(parseDateOr('2026-01-01T00:00:00.000Z', new Date(0)).toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('파싱 불가하면 fallback 을 반환한다', () => {
    const fb = new Date(0);
    expect(parseDateOr('nonsense', fb)).toBe(fb);
    expect(parseDateOr(null, fb)).toBe(fb);
  });
});
