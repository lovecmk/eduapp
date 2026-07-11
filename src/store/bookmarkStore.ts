import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface BookmarkState {
  ids: string[];
  toggle: (id: string) => void;
  has: (id: string) => boolean;
}

/** 카드 즐겨찾기(북마크) — 나중에 다시 볼 카드를 저장. 학습앱 공통 기능. */
export const useBookmarkStore = create<BookmarkState>()(
  persist(
    (set, get) => ({
      ids: [],
      toggle: (id) =>
        set((s) => ({ ids: s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [id, ...s.ids] })),
      has: (id) => get().ids.includes(id),
    }),
    { name: 'bookmarks', version: 1, storage: createJSONStorage(() => AsyncStorage) },
  ),
);
