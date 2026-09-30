import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sanitizeText, isMeaningful, INPUT_LIMITS } from '../utils/sanitize';
import { env } from '../data/network/env';

export interface CardTip {
  id: string;
  cardId: string;
  author: string;
  color: string;
  body: string;
  likes: number;
  likedByMe: boolean;
  mine?: boolean;
  /** 시드 팁 전용 고정값. 내 팁은 createdAt 으로 센다(예전엔 0 으로 저장돼 영원히 '방금'이었다). */
  minutesAgo: number;
  createdAt?: number;
}

/** 이 팁이 올라온 지 몇 분. */
export function tipMinutesAgo(t: { minutesAgo: number; createdAt?: number }, now = Date.now()): number {
  return typeof t.createdAt === 'number' ? Math.max(0, Math.floor((now - t.createdAt) / 60_000)) : t.minutesAgo;
}

const COLORS = ['#5C6BC0', '#26A69A', '#F2B705', '#E2574C', '#7E57C2', '#8D6E63'];

// 카드별 현장 팁(작은 커뮤니티) 목업 — 실무자들이 공유하는 짧은 노하우.
function seedTips(): CardTip[] {
  return [
    { id: 't1', cardId: 'c1', author: '박설비', color: COLORS[1], body: '옥상 드레인 막힘도 같이 보세요. 우기 전 점검이 특히 중요합니다.', likes: 12, likedByMe: false, minutesAgo: 90 },
    { id: 't2', cardId: 'c1', author: '김점검', color: COLORS[0], body: '파라펫 코너 균열은 실링 들뜸이랑 헷갈리기 쉬워요. 타음검사 추천!', likes: 7, likedByMe: false, minutesAgo: 320 },
    { id: 't3', cardId: 'c9', author: '정소방', color: COLORS[3], body: '방수압 잴 때 가장 먼 소화전 기준인 거 잊지 마세요. 피토게이지 각도도 중요.', likes: 21, likedByMe: false, minutesAgo: 45 },
    { id: 't4', cardId: 'c3', author: '최구조', color: COLORS[5], body: '피복 측정 전에 철근 배근도 먼저 확인하면 위치 잡기 훨씬 수월합니다.', likes: 9, likedByMe: false, minutesAgo: 600 },
    { id: 't5', cardId: 'c7', author: '한전기', color: COLORS[2], body: '절연저항 측정 전 잔류전하 방전 꼭! 안 하면 위험하고 값도 튑니다.', likes: 15, likedByMe: false, minutesAgo: 150 },
  ];
}

interface TipState {
  tips: CardTip[];
  forCard: (cardId: string) => CardTip[];
  addTip: (cardId: string, body: string, author: string) => void;
  toggleLike: (id: string) => void;
  removeTip: (id: string) => void;
}

export const useTipStore = create<TipState>()(
  persist(
    (set, get) => ({
      // 시드 팁(박설비·김점검 …)은 목업 모드에서만. 실서버 모드에서 보이면 지어낸 사람의
      // 팁이 '다른 실무자의 노하우'로 읽힌다.
      tips: env.useMockData ? seedTips() : [],
      forCard: (cardId) => get().tips.filter((t) => t.cardId === cardId).sort((a, b) => b.likes - a.likes || tipMinutesAgo(a) - tipMinutesAgo(b)),
      addTip: (cardId, body, author) => {
        const clean = sanitizeText(body, { maxLength: INPUT_LIMITS.tip, allowNewlines: true });
        if (!isMeaningful(clean)) return; // 공백·특수문자만 있는 입력 차단
        set((s) => ({
          tips: [
            { id: `mine-${Date.now()}`, cardId, author, color: '#2563EB', body: clean, likes: 0, likedByMe: false, mine: true, minutesAgo: 0, createdAt: Date.now() },
            ...s.tips,
          ],
        }));
      },
      toggleLike: (id) =>
        set((s) => ({
          tips: s.tips.map((t) => (t.id === id ? { ...t, likedByMe: !t.likedByMe, likes: t.likes + (t.likedByMe ? -1 : 1) } : t)),
        })),
      removeTip: (id) => set((s) => ({ tips: s.tips.filter((t) => t.id !== id) })),
    }),
    {
      name: 'card-tips',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      // 사용자가 추가한 팁과 좋아요만 영속화(목업 팁은 매번 시드).
      partialize: (s) => ({ tips: s.tips.filter((t) => t.mine || t.likedByMe) }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<TipState>;
        const extra = (p.tips ?? []).filter((t) => t.mine);
        const likedIds = new Set((p.tips ?? []).filter((t) => t.likedByMe).map((t) => t.id));
        const base = current.tips.map((t) => (likedIds.has(t.id) ? { ...t, likedByMe: true, likes: t.likes + 1 } : t));
        return { ...current, tips: [...extra, ...base] };
      },
    },
  ),
);
