/**
 * 연속 출석은 **근무일로 센다**.
 *
 * 달력은 주말·공휴일에 띠를 이어 그린다(쉬는 날은 학습일로 세지 않는다). 그런데
 * 이 숫자만 달력일로 세고 있어서, 같은 화면 안에서 띠는 이어져 있는데 숫자는
 * 매주 월요일마다 1 로 되돌아갔다. 주 5일 근무자에게 '한 달 개근'(30일 연속)은
 * 사실상 도달할 수 없는 조건이었다 — 카드팩 규칙이 걸려 있는 값이라 더 그렇다.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: () => Promise.resolve(null),
  setItem: () => Promise.resolve(),
  removeItem: () => Promise.resolve(),
}));

import { useAttendanceStore } from '../attendanceStore';
import { dateKey } from '../../utils/dateKey';
import { isWorkday } from '../../utils/workday';

/** 오늘부터 거슬러 올라가며 근무일 n 개의 날짜 키. */
function lastWorkdays(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i > -400 && out.length < n; i--) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    if (isWorkday(d)) out.push(dateKey(d));
  }
  return out;
}

/** 오늘부터 거슬러 올라가며 쉬는 날 하나(주말·공휴일). */
function lastRestDay(): string | null {
  for (let i = 0; i > -30; i--) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    if (!isWorkday(d)) return dateKey(d);
  }
  return null;
}

const stamp = (keys: string[]) =>
  useAttendanceStore.setState({ stamps: Object.fromEntries(keys.map((k) => [k, 1])) });

beforeEach(() => useAttendanceStore.setState({ stamps: {} }));

describe('연속 출석(근무일 기준)', () => {
  it('찍은 것이 없으면 0 이다', () => {
    expect(useAttendanceStore.getState().currentStreak()).toBe(0);
  });

  it('최근 근무일 3일을 찍었으면 3 이다 — 사이에 주말이 끼어도 끊기지 않는다', () => {
    stamp(lastWorkdays(3));
    expect(useAttendanceStore.getState().currentStreak()).toBe(3);
  });

  it('근무일 20일을 이어 찍으면 20 이다(한 달 개근이 도달 가능해진다)', () => {
    stamp(lastWorkdays(20));
    expect(useAttendanceStore.getState().currentStreak()).toBe(20);
  });

  it('가장 최근 근무일을 아직 안 찍었어도 그 전까지 이어진 것은 유지한다', () => {
    const w = lastWorkdays(4);
    stamp(w.slice(1)); // 최근 근무일만 비운다
    expect(useAttendanceStore.getState().currentStreak()).toBe(3);
  });

  it('근무일 하나를 거르면 거기서 끊긴다', () => {
    const w = lastWorkdays(5);
    stamp([w[0], w[1], w[3], w[4]]); // w[2] 를 거름
    expect(useAttendanceStore.getState().currentStreak()).toBe(2);
  });

  it('쉬는 날 도장만으로는 이어달리기가 시작되지 않는다(달력의 띠와 같은 규칙)', () => {
    const rest = lastRestDay();
    if (!rest) return; // 30일 안에 쉬는 날이 없을 수는 없지만 방어적으로
    stamp([rest]);
    expect(useAttendanceStore.getState().currentStreak()).toBe(0);
  });
});
