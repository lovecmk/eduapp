// 인앱 "격려·축하 순간" 추적 스토어.
// 알림을 꺼둔 사용자에게도 앱을 켜는 것만으로 성취/기념일 축하를 전할 수 있도록,
// 첫 실행 시각·누적 실행 횟수·이미 축하한 순간의 키를 로컬에 영속화한다.
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface MomentState {
  /** 최초 실행 시각(ISO). 기념일(예: 100일) 계산 기준. */
  firstOpenAt: string | null;
  /** 누적 앱 실행 횟수(격려 멘트 다양화·첫 실행 판별용). */
  totalOpens: number;
  /** 마지막 실행 시각(ISO). */
  lastOpenAt: string | null;
  /** 이미 보여준 축하 순간의 키 목록(중복 노출 방지). */
  celebrated: string[];

  /** 앱 실행 1회를 기록한다(런치당 1회 호출). */
  recordOpen: () => void;
  /** 축하 순간을 '봤음'으로 표시한다. */
  markCelebrated: (key: string) => void;
  /** 특정 키를 이미 축하했는지 여부. */
  hasCelebrated: (key: string) => boolean;
}

export const useMomentStore = create<MomentState>()(
  persist(
    (set, get) => ({
      firstOpenAt: null,
      totalOpens: 0,
      lastOpenAt: null,
      celebrated: [],

      recordOpen: () =>
        set((s) => {
          const now = new Date().toISOString();
          return {
            firstOpenAt: s.firstOpenAt ?? now,
            totalOpens: s.totalOpens + 1,
            lastOpenAt: now,
          };
        }),
      markCelebrated: (key) =>
        set((s) => (s.celebrated.includes(key) ? s : { celebrated: [...s.celebrated, key] })),
      hasCelebrated: (key) => get().celebrated.includes(key),
    }),
    {
      name: 'app-moments',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

/** 최초 실행 이후 경과 일수(0-base). firstOpenAt 이 없으면 0. */
export function daysSinceFirstOpen(firstOpenAt: string | null, now: Date = new Date()): number {
  if (!firstOpenAt) return 0;
  const start = new Date(firstOpenAt).getTime();
  if (Number.isNaN(start)) return 0;
  const diff = now.getTime() - start;
  return Math.max(0, Math.floor(diff / 86_400_000));
}
