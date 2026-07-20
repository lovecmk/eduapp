// 접속 출석 도장 스토어 — 하루 1회 출석 체크인 도장을 찍고
// 누적/연속(스트릭)/월간 출석을 관리한다. 카드팩 획득 조건 엔진(S1)에서 참조한다.
// 실서버 전환 시 attendanceRepository(HTTP)로 대체 가능하도록 순수 로직만 담는다.
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dateKey } from '../utils/dateKey';

/** 오늘로부터 offset 일 전(음수면 과거)의 날짜 키. */
function keyForOffset(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return dateKey(d);
}

interface AttendanceState {
  /** 출석한 날짜 키(YYYY-M-D) → 체크인 시각(ms) */
  stamps: Record<string, number>;

  /** 오늘 출석 도장을 찍는다. 이미 찍었으면 false. */
  checkIn: () => boolean;
  /** 오늘 이미 출석했는지 */
  hasCheckedInToday: () => boolean;
  /** 누적 출석 일수 */
  totalDays: () => number;
  /** 오늘 기준 연속 출석 일수 */
  currentStreak: () => number;
  /** 특정 연/월(0-indexed)의 출석 일수 */
  monthCount: (year: number, month: number) => number;
  /** 특정 날짜 키에 출석했는지 */
  hasStamp: (key: string) => boolean;
}

export const useAttendanceStore = create<AttendanceState>()(
  persist(
    (set, get) => ({
      stamps: {},

      checkIn: () => {
        const today = dateKey(new Date());
        if (get().stamps[today]) return false;
        set((s) => ({ stamps: { ...s.stamps, [today]: Date.now() } }));
        return true;
      },

      hasCheckedInToday: () => !!get().stamps[dateKey(new Date())],

      totalDays: () => Object.keys(get().stamps).length,

      currentStreak: () => {
        const { stamps } = get();
        // 오늘 아직 안 찍었어도 어제까지 이어진 스트릭은 유지되도록 오늘/어제 중 시작점을 찾는다.
        let start = 0;
        if (!stamps[keyForOffset(0)]) {
          if (!stamps[keyForOffset(-1)]) return 0;
          start = -1;
        }
        let streak = 0;
        for (let i = start; i > -3650; i--) {
          if (stamps[keyForOffset(i)]) streak++;
          else break;
        }
        return streak;
      },

      monthCount: (year, month) => {
        const prefix = `${year}-${month}-`;
        return Object.keys(get().stamps).filter((k) => k.startsWith(prefix)).length;
      },

      hasStamp: (key) => !!get().stamps[key],
    }),
    {
      name: 'attendance',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
