import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DAILY_MIN_CARDS, DAILY_MAX_CARDS } from '../constants/learning';
import type { DailyCardRange } from '../domain/models/ServiceConfig';

/**
 * 마지막으로 확인한 **운영값**(운영자가 콘솔에서 바꾸는 값) 중, 서버에 닿지 못할 때도
 * 지켜야 하는 것만 기기에 남긴다. 지금은 하루 출제 범위 하나다.
 *
 * ── 왜 남기나 ──────────────────────────────────────────────────────────
 * 운영자가 "이번 주는 3장까지"로 줄여도, 앱이 그 값을 메모리에만 두면 다음에 앱을
 * 켤 때 컴파일된 상수(3~5장)로 되돌아간다. 이 앱은 지하·철골 구조물에서 쓰여
 * 서버에 닿지 못한 채 시작하는 날이 흔하므로, 그 상태가 드문 예외가 아니다.
 * 같은 사람이 사무실(온라인)에서 3장, 현장(오프라인)에서 5장을 받게 된다.
 *
 * ── 점검 모드는 남기지 않는다 ──────────────────────────────────────────
 * 여기에 `maintenance` 를 함께 저장하면, 점검이 끝난 뒤 서버에 닿지 못하는 기기가
 * 지난 점검 상태로 잠긴 채 열린다. 잠금은 **지금 서버가 그렇다고 말할 때만** 건다
 * (실패는 항상 서비스가 열려 있는 쪽으로 — `defaultServiceConfig`).
 *
 * ── 사용자 종속이 아니다 ───────────────────────────────────────────────
 * 운영 정책은 기기를 쓰는 사람이 바뀌어도 그대로다. 그래서 `app-settings` 처럼
 * `USER_SCOPED_PERSIST_KEYS` 에 넣지 않는다.
 */
interface ServerPolicyState {
  dailyMinCards: number;
  dailyMaxCards: number;
  /** 서버에서 읽은 운영값을 기억한다(실서버 응답에서만 부른다). */
  rememberDailyRange: (range: DailyCardRange) => void;
}

export const useServerPolicyStore = create<ServerPolicyState>()(
  persist(
    (set) => ({
      dailyMinCards: DAILY_MIN_CARDS,
      dailyMaxCards: DAILY_MAX_CARDS,
      rememberDailyRange: ({ min, max }) => set({ dailyMinCards: min, dailyMaxCards: max }),
    }),
    {
      name: 'server-policy',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      // 함수는 저장하지 않는다.
      partialize: (s) => ({ dailyMinCards: s.dailyMinCards, dailyMaxCards: s.dailyMaxCards }),
    },
  ),
);

/**
 * 지금 적용할 하루 출제 범위 — 마지막으로 확인한 운영값, 없으면 앱 상수.
 * 화면이 아니라 편성기(오프라인 편성)가 부르므로 훅이 아닌 함수로 둔다.
 */
export function currentDailyRange(): DailyCardRange {
  const { dailyMinCards, dailyMaxCards } = useServerPolicyStore.getState();
  return { min: dailyMinCards, max: dailyMaxCards };
}
