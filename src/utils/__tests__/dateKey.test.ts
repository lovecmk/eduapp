import { dateKey, startOfDay, dayDiff } from '../dateKey';

// Explicit Korean civil dates keep these assertions independent of the test PC's TZ.
const civil = (year: number, month: number, day: number, hour = 0, minute = 0) =>
  new Date(Date.UTC(year, month, day, hour, minute) - 9 * 3_600_000);

/**
 * 이 세 함수는 앱에서 '하루'가 무엇인지 정하는 유일한 기준이다.
 * 출석 달력·연속 학습(스트릭)·오늘의 학습량·복습 예정일이 전부 여기에 매달려 있다.
 * 그런데 커버리지가 0% 였다 — 가장 많이 쓰이는데 가장 검증이 없었다.
 *
 * 특히 지켜야 할 것은 **KST 기준**이라는 점이다. UTC 로 계산하면
 * 한국(UTC+9)에서는 자정이 아니라 오전 9시에 날짜가 바뀌어, 새벽에 학습한 기록이
 * 어제 칸에 찍힌다.
 */

describe('dateKey', () => {
  it('UTC·해외 기기에서도 서버와 같은 KST 자정에 키가 바뀐다', () => {
    expect(dateKey(new Date('2026-10-01T14:59:59Z'))).toBe('2026-9-1');
    expect(dateKey(new Date('2026-10-01T15:00:00Z'))).toBe('2026-9-2');
    expect(dateKey(new Date('2026-10-02T00:00:00+09:00'))).toBe('2026-9-2');
  });
  it('같은 날이면 시각이 달라도 같은 키다', () => {
    const morning = new Date('2026-07-28T00:00:00+09:00');
    const night = new Date('2026-07-28T23:59:59+09:00');
    expect(dateKey(morning)).toBe(dateKey(night));
  });

  it('자정을 넘기면 키가 바뀐다', () => {
    const before = new Date('2026-07-28T23:59:59+09:00');
    const after = new Date('2026-07-29T00:00:00+09:00');
    expect(dateKey(before)).not.toBe(dateKey(after));
  });

  it('month 는 0-based 다 — 형식이 바뀌면 저장된 히스토리를 못 읽는다', () => {
    // 이미 저장된 키와 호환되어야 하므로 형식 자체가 계약이다.
    expect(dateKey(civil(2026, 0, 5))).toBe('2026-0-5');
    expect(dateKey(civil(2026, 11, 31))).toBe('2026-11-31');
  });

  it('UTC 가 아니라 KST 기준이다', () => {
    // 로컬 자정 직후는 아직 UTC 로는 전날일 수 있다. 그래도 '오늘'이어야 한다.
    const justAfterMidnight = new Date('2026-07-28T00:30:00+09:00');
    expect(dateKey(justAfterMidnight)).toBe('2026-6-28');
  });
});

describe('startOfDay', () => {
  it('시·분·초를 모두 0 으로 만든다', () => {
    const d = startOfDay(new Date('2026-07-28T17:42:09.500+09:00'));
    expect(d.toISOString()).toBe('2026-07-27T15:00:00.000Z');
  });

  it('날짜 자체는 바꾸지 않는다', () => {
    const d = startOfDay(civil(2026, 6, 28, 23, 59));
    expect(dateKey(d)).toBe('2026-6-28');
  });

  it('원본을 건드리지 않는다', () => {
    const src = civil(2026, 6, 28, 13, 0);
    startOfDay(src);
    expect(src.toISOString()).toBe('2026-07-28T04:00:00.000Z');
  });
});

describe('dayDiff', () => {
  it('같은 날은 0 이다 — 시각이 달라도', () => {
    expect(dayDiff(civil(2026, 6, 28, 23, 0), civil(2026, 6, 28, 1, 0))).toBe(0);
  });

  it('하루 차이는 1 이다', () => {
    expect(dayDiff(civil(2026, 6, 29, 1, 0), civil(2026, 6, 28, 23, 0))).toBe(1);
  });

  it('과거는 음수다', () => {
    expect(dayDiff(civil(2026, 6, 25), civil(2026, 6, 28))).toBe(-3);
  });

  it('달과 해를 넘어가도 맞는다', () => {
    expect(dayDiff(civil(2026, 7, 1), civil(2026, 6, 31))).toBe(1);
    expect(dayDiff(civil(2027, 0, 1), civil(2026, 11, 31))).toBe(1);
  });

  it('윤년 2월을 건너뛰어도 맞는다', () => {
    // 2028 은 윤년이라 2/29 가 있다.
    expect(dayDiff(civil(2028, 2, 1), civil(2028, 1, 28))).toBe(2);
  });

  it('서머타임이 있는 지역에서도 하루는 하루다', () => {
    // 자정 기준으로 빼기 때문에 23시간/25시간인 날에도 1 이 나와야 한다.
    // (한국은 DST 가 없지만, 계산이 시각이 아니라 날짜에 기대는지를 확인한다)
    const days = dayDiff(civil(2026, 2, 9), civil(2026, 2, 8));
    expect(days).toBe(1);
  });

  it('기기 날짜가 같아도 한국 자정을 넘으면 다음 날이다', () => {
    expect(dayDiff(new Date('2026-10-23T15:00:00Z'), new Date('2026-10-23T14:59:59Z'))).toBe(1);
  });
});
