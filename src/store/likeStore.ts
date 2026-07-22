import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface LikeState {
  ids: string[];
  toggle: (id: string) => void;
  has: (id: string) => boolean;
}

/** 카드 추천(좋아요) — 도움이 된 카드에 공감을 남긴다. 저장(북마크)과 별개의 가벼운 반응. */
export const useLikeStore = create<LikeState>()(
  persist(
    (set, get) => ({
      ids: [],
      toggle: (id) =>
        set((s) => ({ ids: s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [id, ...s.ids] })),
      has: (id) => get().ids.includes(id),
    }),
    { name: 'card-likes', version: 1, storage: createJSONStorage(() => AsyncStorage) },
  ),
);
