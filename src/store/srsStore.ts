import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initialState, schedule, MAX_BOX, type Grade, type SrsCardState } from '../domain/srs';
import { dateKey } from '../utils/dateKey';

const DAY = 86_400_000;

interface SrsState {
  cards: Record<string, SrsCardState>;
  /** 날짜별 복습한 카드 id 목록 — 캘린더 히트맵/상세용 */
  history: Record<string, string[]>;
  seeded: boolean;

  /** 최초 1회, 카드 목록으로 데모 친화적인 스케줄+히스토리를 시드한다. */
  ensureSeeded: (cardIds: string[]) => void;
  /** 채점: 상태 갱신 + 오늘 히스토리 기록. 다음 상태의 box 를 반환. */
  grade: (cardId: string, grade: Grade) => number;
  getState: (cardId: string) => SrsCardState | undefined;
  reset: () => void;
}

/** 결정적 난수 생성기(mulberry32) — 시드가 같으면 항상 같은 분포. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seed(cardIds: string[]): Pick<SrsState, 'cards' | 'history'> {
  const rng = mulberry32(20260710);
  const now = Date.now();
  const cards: Record<string, SrsCardState> = {};

  // 카드별 학습 이력 프로필 부여(오버듀/예정/장기기억이 섞이도록).
  for (const id of cardIds) {
    const r = rng();
    let box: number;
    let dueOffsetDays: number;
    if (r < 0.45) {
      box = Math.floor(rng() * 2); // 0~1
      dueOffsetDays = -(rng() * 2); // 이미 지남(복습 필요)
    } else if (r < 0.72) {
      box = 2 + Math.floor(rng() * 2); // 2~3
      dueOffsetDays = rng() * 3; // 곧 예정
    } else {
      box = 4 + Math.floor(rng() * 2); // 4~5
      dueOffsetDays = 3 + rng() * 22; // 장기기억, 먼 미래
    }
    const reps = box + Math.floor(rng() * 3);
    const lastReviewedAt = now - Math.round((0.5 + rng() * 2) * DAY);
    cards[id] = {
      box,
      reps,
      lapses: Math.floor(rng() * 2),
      lastGrade: 'good',
      lastReviewedAt,
      dueAt: now + Math.round(dueOffsetDays * DAY),
    };
  }

  // 최소 5장은 오늘 복습 대상으로 보장(가장 가까운 예정 카드들을 당김).
  const soon = [...cardIds].sort((a, b) => cards[a].dueAt - cards[b].dueAt);
  soon.slice(0, 5).forEach((id, i) => { cards[id].dueAt = now - (i + 1) * 3600_000; });

  // 최근 13일 히트맵 히스토리(오늘은 실사용으로 누적).
  const history: Record<string, string[]> = {};
  for (let off = 13; off >= 1; off--) {
    const d = new Date(now - off * DAY);
    const n = 1 + Math.floor(rng() * 6);
    const ids: string[] = [];
    for (let k = 0; k < n; k++) ids.push(cardIds[Math.floor(rng() * cardIds.length)]);
    history[dateKey(d)] = Array.from(new Set(ids));
  }
  return { cards, history };
}

export const useSrsStore = create<SrsState>()(
  persist(
    (set, get) => ({
      cards: {},
      history: {},
      seeded: false,

      ensureSeeded: (cardIds) => {
        if (get().seeded || cardIds.length === 0) {
          // 새로 추가된 카드가 있으면 기본 상태만 보강.
          const cards = { ...get().cards };
          let changed = false;
          for (const id of cardIds) {
            if (!cards[id]) { cards[id] = initialState(); changed = true; }
          }
          if (changed) set({ cards });
          return;
        }
        set({ ...seed(cardIds), seeded: true });
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
      version: 1,
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
