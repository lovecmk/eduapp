// 진영(팀) 선택 상태 — 회원가입 직후 고른 진영을 로컬에 보존한다.
// 커뮤니티 '함께 짓는 안전 빌딩'이 이 진영 색·형태로 표시되고 진영끼리 대항한다.
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FactionId } from '../constants/factions';
import { toFactionId } from '../constants/factions';

interface FactionState {
  faction: FactionId | null;
  chooseFaction: (id: FactionId) => void;
  reset: () => void;
}

export const useFactionStore = create<FactionState>()(
  persist(
    (set) => ({
      faction: null,
      chooseFaction: (id) => set({ faction: id }),
      reset: () => set({ faction: null }),
    }),
    {
      name: 'faction',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ faction: s.faction }),
      merge: (persisted, current) => ({ ...current, faction: toFactionId((persisted as { faction?: string } | null)?.faction) }),
    },
  ),
);
