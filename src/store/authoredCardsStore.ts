import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SeedCard } from '../domain/models/LearningCard';

/**
 * 앱에서(또는 웹 도구로) 등록한 문제(카드)의 로컬 보관소.
 * 서버 이관 전까지 등록 카드를 여기 저장하고, MockCardRepository 가 학습 목록에 병합한다.
 */
interface AuthoredState {
  cards: SeedCard[];
  addCards: (cards: SeedCard[]) => void;
  removeCard: (id: string) => void;
  clear: () => void;
}

export const useAuthoredCardsStore = create<AuthoredState>()(
  persist(
    (set) => ({
      cards: [],
      addCards: (cards) => set((s) => ({ cards: [...cards, ...s.cards] })),
      removeCard: (id) => set((s) => ({ cards: s.cards.filter((c) => c.id !== id) })),
      clear: () => set({ cards: [] }),
    }),
    { name: 'authored-cards', version: 1, storage: createJSONStorage(() => AsyncStorage) },
  ),
);
