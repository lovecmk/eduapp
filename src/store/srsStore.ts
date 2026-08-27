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
  /**
   * 서버 스냅샷을 로컬에 병합한다(기기 변경·재설치 후 복원).
   *
   * **덮어쓰지 않고 합친다.** 오프라인에서 방금 채점한 것이 서버에는 아직
   * 없을 수 있는데, 서버 값으로 통째로 갈아 끼우면 그 채점이 사라진다.
   * 카드별로는 **더 나중에 복습한 쪽**이 이긴다 — 같은 카드를 두 기기에서
   * 풀었다면 마지막에 푼 것이 그 카드의 현재 상태다.
   */
  applyServer: (snapshot: { cards: Record<string, SrsCardState>; history: Record<string, string[]> }) => void;
  reset: () => void;
}

/** 두 SRS 상태 중 더 최근에 복습한 쪽. 시각이 같거나 없으면 reps 가 많은 쪽. */
function newerSrs(a: SrsCardState, b: SrsCardState): SrsCardState {
  const at = a.lastReviewedAt ?? 0;
  const bt = b.lastReviewedAt ?? 0;
  if (at !== bt) return at > bt ? a : b;
  return a.reps >= b.reps ? a : b;
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

      applyServer: ({ cards, history }) => {
        const localCards = get().cards;
        const mergedCards: Record<string, SrsCardState> = { ...localCards };
        for (const [id, remote] of Object.entries(cards)) {
          const local = localCards[id];
          mergedCards[id] = local ? newerSrs(local, remote) : remote;
        }

        // 이력은 '그날 무엇을 공부했나'라 합집합이 맞다 — 어느 기기에서 풀었든
        // 그날 공부한 것은 사실이고, 한쪽을 버리면 달력에 구멍이 난다.
        const mergedHistory: Record<string, string[]> = { ...get().history };
        for (const [day, ids] of Object.entries(history)) {
          mergedHistory[day] = Array.from(new Set([...(mergedHistory[day] ?? []), ...ids]));
        }
        set({ cards: mergedCards, history: mergedHistory });
      },

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
