import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dateKey } from '../utils/dateKey';

// 오늘 학습한 '신규 카드' 수를 로컬에 기록한다(하루 상한 집행의 오프라인 원천).
// 날짜가 바뀌면 자동으로 0부터 다시 센다.
//
// ⚠️ 실서버 연동 시: 이 값은 서버가 권위를 갖는다(learningQuotaRepository).
//    로컬 스토어는 오프라인/목업 폴백 및 즉시 UI 반영용으로만 유지한다.
interface DailyLearningState {
  /** 마지막으로 기록한 날짜 키(YYYY-M-D). */
  dayKey: string;
  /** 그날 학습한 신규 카드 수. */
  newLearnedToday: number;
  /** 신규 카드 1장(또는 n장) 학습 완료를 기록 — 날짜가 바뀌었으면 리셋 후 집계. */
  recordNewLearned: (n?: number) => void;
  /** 오늘 기준 학습 수(날짜가 바뀌었으면 0). */
  usedToday: () => number;
  /**
   * 날짜가 바뀌었으면 오늘 기준으로 초기화한다.
   * usedToday() 는 읽는 시점에 날짜를 비교하므로 값은 이미 0으로 보이지만,
   * 스토어 상태 자체가 바뀌지 않으면 구독 중인 화면이 리렌더되지 않아
   * '오늘의 학습 3/3' 같은 어제 진행도가 화면에 그대로 남는다.
   * 앱 복귀(포그라운드) 시 호출해 자정 넘김을 화면에 반영한다.
   */
  rolloverIfNeeded: () => void;
}

export const useDailyLearningStore = create<DailyLearningState>()(
  persist(
    (set, get) => ({
      dayKey: dateKey(new Date()),
      newLearnedToday: 0,
      recordNewLearned: (n = 1) => {
        const today = dateKey(new Date());
        const { dayKey, newLearnedToday } = get();
        if (dayKey !== today) set({ dayKey: today, newLearnedToday: n });
        else set({ newLearnedToday: newLearnedToday + n });
      },
      usedToday: () => {
        const { dayKey, newLearnedToday } = get();
        return dayKey === dateKey(new Date()) ? newLearnedToday : 0;
      },
      rolloverIfNeeded: () => {
        const today = dateKey(new Date());
        if (get().dayKey !== today) set({ dayKey: today, newLearnedToday: 0 });
      },
    }),
    {
      name: 'daily-learning',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
