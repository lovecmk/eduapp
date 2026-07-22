import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CardStatus } from '../domain/models/LearningCard';

// 카드별 학습 상태(학습전 new / 학습중 learning / 학습완료 mastered)의 '단일 진실 원천'.
//
// 예전엔 목업 시드가 인덱스에 따라 일부 카드를 임의로 mastered/learning 으로 만들어
// (6장마다 완료…) '아무것도 안 했는데 학습완료'이거나 '데이터 초기화 후에도 완료로 남는'
// 문제가 있었다. 이제 모든 카드는 기본이 'new'(학습전)이고, 실제 학습으로만 상태가 바뀌며
// 그 변화만 여기에 영속화한다. 데이터 초기화 시 reset() 으로 완전히 비운다.
interface CardProgressState {
  /** cardId → 현재 학습 상태(없으면 'new'로 간주). */
  status: Record<string, CardStatus>;
  setStatus: (id: string, status: CardStatus) => void;
  getStatus: (id: string) => CardStatus;
  reset: () => void;
}

export const useCardProgressStore = create<CardProgressState>()(
  persist(
    (set, get) => ({
      status: {},
      setStatus: (id, status) => set((s) => ({ status: { ...s.status, [id]: status } })),
      getStatus: (id) => get().status[id] ?? 'new',
      reset: () => set({ status: {} }),
    }),
    { name: 'card-progress', version: 1, storage: createJSONStorage(() => AsyncStorage) },
  ),
);
