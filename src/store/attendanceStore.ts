// 접속 출석 도장 스토어 — 하루 1회 출석 체크인 도장을 찍고
// 누적/연속(스트릭)/월간 출석을 관리한다. 카드팩 획득 조건 엔진(S1)에서 참조한다.
// 실서버 전환 시 attendanceRepository(HTTP)로 대체 가능하도록 순수 로직만 담는다.
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dateKey } from '../utils/dateKey';
import { isWorkday } from '../utils/workday';

/** 오늘로부터 offset 일 전(음수면 과거)의 날짜. */
function dateForOffset(offset: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d;
}

/** 오늘로부터 offset 일 전(음수면 과거)의 날짜 키. */
function keyForOffset(offset: number): string {
  return dateKey(dateForOffset(offset));
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
  /**
   * 서버가 보관한 출석 도장을 로컬에 합친다(기기 변경·재설치 후 복원).
   *
   * 합집합이다 — 출석은 '그날 왔다'는 사실이라 한쪽에만 있어도 참이고,
   * 서버 값으로 덮어쓰면 오프라인에서 찍은 오늘 도장이 사라진다.
   * 같은 날이 양쪽에 있으면 **먼저 찍은 시각**을 남긴다(그날의 첫 출석이 기록이다).
   */
  applyServer: (stamps: Record<string, number>) => void;
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

      applyServer: (remote) => {
        const merged = { ...get().stamps };
        for (const [day, at] of Object.entries(remote)) {
          const local = merged[day];
          merged[day] = local ? Math.min(local, at) : at;
        }
        set({ stamps: merged });
      },

      totalDays: () => Object.keys(get().stamps).length,

      /**
       * 오늘 기준 연속 출석 — **근무일로 센다.**
       *
       * 달력은 주말·공휴일에 띠를 이어 그린다(쉬는 날은 학습일로 세지 않으므로,
       * 금요일에 하고 월요일에 이은 사람은 한 번도 거르지 않은 것이다). 그런데
       * 이 숫자만 달력일로 세고 있어서, 같은 화면 안에서 **띠는 이어져 있는데
       * 숫자는 매주 월요일마다 1 로 되돌아갔다.** 주 5일 근무자에게는 '3일 연속
       * 출석'조차 주말을 낀 순간 끊기고, '한 달 개근'은 사실상 도달할 수 없는
       * 조건이 된다 — 카드팩 규칙이 걸려 있는 값이라 더 그렇다.
       *
       * 쉬는 날은 **투명하게 넘어간다**(끊지도, 세지도 않는다). 그날 도장이
       * 찍혀 있어도 근무일이 아니면 세지 않는다 — 달력이 그리는 띠와 같은 규칙이라
       * 두 표시가 같은 말을 한다.
       */
      currentStreak: () => {
        const { stamps } = get();
        // 오늘부터 거슬러 올라가며 근무일만 모은다(연휴가 길어도 10년이면 충분하다).
        const workdays: string[] = [];
        for (let i = 0; i > -3650 && workdays.length < 400; i--) {
          const d = dateForOffset(i);
          if (isWorkday(d)) workdays.push(dateKey(d));
        }
        if (workdays.length === 0) return 0;

        // 가장 최근 근무일에 아직 안 찍었어도, 그 전 근무일까지 이어진 것은 유지한다
        // (오늘 아침에 아직 앱을 안 연 사람의 어제까지를 지워 버리지 않는다).
        let start = 0;
        if (!stamps[workdays[0]]) {
          if (!stamps[workdays[1]]) return 0;
          start = 1;
        }
        let streak = 0;
        for (let i = start; i < workdays.length; i++) {
          if (stamps[workdays[i]]) streak++;
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
