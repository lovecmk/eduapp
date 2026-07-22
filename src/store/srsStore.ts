import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initialState, schedule, MAX_BOX, type Grade, type SrsCardState } from '../domain/srs';
import { dateKey } from '../utils/dateKey';

interface SrsState {
  cards: Record<string, SrsCardState>;
  /** 날짜별 복습한 카드 id 목록 — 캘린더 히트맵/상세용 */
  history: Record<string, string[]>;
  seeded: boolean;

  /** 카드 목록의 기본 상태를 보강한다(가짜 이력은 만들지 않는다). */
  ensureSeeded: (cardIds: string[]) => void;
  /** 채점: 상태 갱신 + 오늘 히스토리 기록. 다음 상태의 box 를 반환. */
  grade: (cardId: string, grade: Grade) => number;
  getState: (cardId: string) => SrsCardState | undefined;
  reset: () => void;
}

export const useSrsStore = create<SrsState>()(
  persist(
    (set, get) => ({
      cards: {},
      history: {},
      seeded: false,

      // 예전엔 최초 1회 '데모 친화적' 가짜 복습이력/스케줄(지난 13일치 히트맵 포함)을
      // 심었는데, 이 때문에 아무 학습도 안 한 사용자·초기화 직후 사용자에게
      // '주말·공휴일에도 학습했다'거나 '이미 복습 예정이 쌓여있다'는 잘못된 상태가 보였다.
      //
      // 이제 어떤 가짜 상태도 만들지 않는다. SRS 상태는 사용자가 카드를 '실제로 채점할 때'
      // grade() 안에서 initialState 로부터 처음 생성된다. 학습하지 않은 카드는 SRS 상태가
      // 아예 없으므로 '복습 예정(due)'에 잡히지 않는다 — 학습전/학습중/학습완료가 엄격히 맞아떨어진다.
      ensureSeeded: (cardIds) => {
        if (cardIds.length === 0) return;
        if (!get().seeded) set({ seeded: true });
      },

      grade: (cardId, g) => {
        const prev = get().cards[cardId] ?? initialState();
        const next = schedule(prev, g);
        const key = dateKey(new Date());
        const today = get().history[key] ?? [];
        set({
          cards: { ...get().cards, [cardId]: next },
          history: { ...get().history, [key]: Array.from(new Set([...today, cardId])) },
        });
        return next.box;
      },

      getState: (cardId) => get().cards[cardId],
      reset: () => set({ cards: {}, history: {}, seeded: false }),
    }),
    {
      name: 'srs-scheduler',
      // v2: 예전 버전이 심어둔 '가짜 복습이력/스케줄'을 일괄 제거한다.
      // (초기화하지 않은 기존 사용자에게도 주말 학습 오표기 등이 남지 않도록.)
      version: 2,
      migrate: () => ({ cards: {}, history: {}, seeded: false }),
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

/** 박스 분포 집계 — 기억 강도 시각화용. */
export function boxDistribution(cards: Record<string, SrsCardState>): number[] {
  const dist = new Array(MAX_BOX + 1).fill(0) as number[];
  for (const s of Object.values(cards)) dist[Math.max(0, Math.min(MAX_BOX, s.box))]++;
  return dist;
}
