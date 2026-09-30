import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CardTip } from '../domain/models/CardTip';

// 현장 팁의 **로컬 사본** — 서버(`/inner/api/v1/cards/:id/tips`)에 닿지 못하거나 목업 모드일 때
// TipRepository 폴백(MockTipRepository)이 이 스토어를 원천으로 쓴다. 화면은 hooks/useCardTips 만 본다.
//
// 예전에 있던 시드 팁 5건(박설비·김점검 …)은 걷어 냈다. 카드 id 가 'c1'·'c9' 처럼 지금의
// 어떤 카드와도 맞지 않아 목업에서조차 보이지 않았고, 실서버 모드에서 보이면 지어낸
// 사람의 노하우가 된다.
export type { CardTip } from '../domain/models/CardTip';
export { tipMinutesAgo } from '../domain/models/CardTip';

interface TipState {
  tips: CardTip[];
  add: (tip: CardTip) => void;
  setLike: (id: string, liked: boolean) => void;
  remove: (id: string) => void;
}

export const useTipStore = create<TipState>()(
  persist(
    (set) => ({
      tips: [],
      add: (tip) => set((s) => ({ tips: [tip, ...s.tips.filter((t) => t.id !== tip.id)] })),
      setLike: (id, liked) =>
        set((s) => ({
          tips: s.tips.map((t) =>
            t.id === id && t.likedByMe !== liked
              ? { ...t, likedByMe: liked, likes: Math.max(0, t.likes + (liked ? 1 : -1)) }
              : t,
          ),
        })),
      remove: (id) => set((s) => ({ tips: s.tips.filter((t) => t.id !== id) })),
    }),
    {
      name: 'card-tips',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      // 이 기기에서 쓴 팁만 남긴다(예전 저장본에 섞여 있을 수 있는 시드 공감 기록은 버린다).
      partialize: (s) => ({ tips: s.tips.filter((t) => t.mine) }),
    },
  ),
);
