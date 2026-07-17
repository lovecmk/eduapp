import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLLECTIBLES, COLLECTIBLE_BY_ID, DRAW_WEIGHTS, PACK_SIZE } from '../data/collectibles';
import type { RarityTier } from '../utils/rarity';

export interface DrawResult {
  id: string;
  /** 이번에 처음 획득한 카드인지 */
  isNew: boolean;
}

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const RARITY_ORDER: RarityTier[] = ['common', 'rare', 'epic', 'legendary'];

/** 가중치로 등급 1개를 뽑고, 그 등급의 카드 중 랜덤 1장 id 를 반환. */
function drawOne(): string {
  const r = Math.random();
  let acc = 0;
  let tier: RarityTier = 'common';
  for (const t of RARITY_ORDER) {
    acc += DRAW_WEIGHTS[t];
    if (r <= acc) { tier = t; break; }
  }
  const pool = COLLECTIBLES.filter((c) => c.rarity === tier);
  return pool[Math.floor(Math.random() * pool.length)].id;
}

interface CollectionState {
  /** 카드 id → 보유 장수 */
  owned: Record<string, number>;
  /** 보유 카드팩 수 */
  packs: number;
  /** 마지막으로 일일 무료팩을 받은 날(YYYY-MM-DD) */
  lastDailyPack: string | null;
  /** 학습 적립 진행(3회 학습 시 팩 1개) */
  studyProgress: number;
  /** 최근 새로 획득해 아직 확인 안 한 카드들(도감 NEW 뱃지) */
  newIds: string[];

  /** 오늘 무료팩을 아직 안 받았으면 지급. 받았으면 false. */
  claimDaily: () => boolean;
  /** 학습 세션 완료 등으로 진행 적립 — 3회마다 팩 1개 지급. */
  addStudyProgress: () => void;
  /** 팩 즉시 지급(디버그/보상). */
  grantPack: (n?: number) => void;
  /** 팩 1개를 열어 PACK_SIZE 장을 뽑는다. 팩이 없으면 null. */
  openPack: () => DrawResult[] | null;
  /** 도감에서 NEW 표시를 확인 처리. */
  clearNew: (ids: string[]) => void;
}

const STUDY_PER_PACK = 3;

export const useCollectionStore = create<CollectionState>()(
  persist(
    (set, get) => ({
      owned: {},
      packs: 2, // 첫 방문에 바로 열어볼 수 있게 2팩 지급
      lastDailyPack: null,
      studyProgress: 0,
      newIds: [],

      claimDaily: () => {
        const today = todayKey();
        if (get().lastDailyPack === today) return false;
        set((s) => ({ packs: s.packs + 1, lastDailyPack: today }));
        return true;
      },

      addStudyProgress: () =>
        set((s) => {
          const p = s.studyProgress + 1;
          if (p >= STUDY_PER_PACK) return { studyProgress: 0, packs: s.packs + 1 };
          return { studyProgress: p };
        }),

      grantPack: (n = 1) => set((s) => ({ packs: s.packs + n })),

      openPack: () => {
        if (get().packs <= 0) return null;
        const ids: string[] = Array.from({ length: PACK_SIZE }, () => drawOne());
        // 페리티(pity): 한 팩에 rare 이상이 하나도 없으면 한 장을 rare 로 승격.
        if (!ids.some((id) => COLLECTIBLE_BY_ID[id].rarity !== 'common')) {
          const rares = COLLECTIBLES.filter((c) => c.rarity === 'rare');
          ids[Math.floor(Math.random() * ids.length)] = rares[Math.floor(Math.random() * rares.length)].id;
        }
        const results: DrawResult[] = [];
        set((s) => {
          const owned = { ...s.owned };
          const newSet = new Set(s.newIds);
          for (const id of ids) {
            const isNew = !owned[id];
            owned[id] = (owned[id] ?? 0) + 1;
            if (isNew) newSet.add(id);
            results.push({ id, isNew });
          }
          return { owned, packs: s.packs - 1, newIds: [...newSet] };
        });
        return results;
      },

      clearNew: (ids) => set((s) => ({ newIds: s.newIds.filter((x) => !ids.includes(x)) })),
    }),
    { name: 'collection', version: 1, storage: createJSONStorage(() => AsyncStorage) },
  ),
);
