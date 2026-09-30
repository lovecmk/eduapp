import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AchievementSnapshot } from '../utils/achievement';
import { env } from '../data/network/env';

// 인앱 커뮤니티 '자랑 피드' — 완성된 성취 카드를 외부 SNS 대신 앱 내부에 올려
// 유저끼리 서로를 증명·자랑한다. 클라이언트에서 카드를 이미지화(react-native-view-shot)해
// imageUri 로 올리므로, 추후 내부 서버 전환 시 uploadShareCard 한 곳만 교체하면 된다.
/** 퀵 리액션 종류 — 👏 응원 / 🔥 열정 / 👍 좋아요. */
export type ReactionKind = 'clap' | 'fire' | 'up';
export const REACTION_KINDS: ReactionKind[] = ['clap', 'fire', 'up'];
export const REACTION_EMOJI: Record<ReactionKind, string> = { clap: '👏', fire: '🔥', up: '👍' };

export interface ShareCardPost {
  id: string;
  author: string;
  /** 아바타 색상 */
  color: string;
  /** 기기에서 래스터화한 카드 이미지(uri). 웹/캡처 미지원 환경에서는 null → 스냅샷으로 렌더. */
  imageUri: string | null;
  /** 이미지 종횡비(width/height) — 원본 비율 유지용 */
  aspect: number;
  /** 카드에 박제된 성취 데이터(이미지가 없을 때 폴백 렌더에 사용) */
  snapshot: AchievementSnapshot;
  likes: number;
  likedByMe: boolean;
  /** 퀵 리액션 집계 */
  reactions: Record<ReactionKind, number>;
  /** 내가 누른 리액션들 */
  myReactions: ReactionKind[];
  mine?: boolean;
  /** 상대 시간(분) — 시드 글 전용 고정값. 내가 올린 글은 createdAt 으로 계산한다. */
  minutesAgo: number;
  /**
   * 올린 시각(ms). 예전에는 내 글도 `minutesAgo: 0` 으로 저장해, 며칠이 지나도
   * 피드에 **'방금'** 으로 떴다. 저장값이 시간이 흘러도 바뀌지 않기 때문이다.
   */
  createdAt?: number;
}

/** 이 글이 올라온 지 몇 분 — 올린 시각이 있으면 지금 기준으로 센다. */
export function postMinutesAgo(p: { minutesAgo: number; createdAt?: number }, now = Date.now()): number {
  return typeof p.createdAt === 'number' ? Math.max(0, Math.floor((now - p.createdAt) / 60_000)) : p.minutesAgo;
}

/** uploadShareCard 입력 — 서버 전환 시에도 이 형태(멀티파트 body)를 그대로 매핑하면 된다. */
export interface ShareCardUpload {
  author: string;
  color: string;
  imageUri: string | null;
  aspect: number;
  snapshot: AchievementSnapshot;
}

function mockSnapshot(over: Partial<AchievementSnapshot>): AchievementSnapshot {
  return {
    title: '균형잡힌 점검가',
    emoji: '⚖️',
    totalLearned: 120,
    masteredCount: 96,
    totalCards: 160,
    completionPct: 60,
    accuracyPct: 88,
    streakDays: 12,
    bestStreak: 21,
    level: 5,
    levelTitle: '숙련 점검가',
    topCategory: '전기 위험',
    topEmoji: '⚡',
    topCategoryPct: 74,
    periodLabel: '2026.07',
    ...over,
  };
}

function seed(): ShareCardPost[] {
  return [
    {
      id: 'brag-1', author: '김안전', color: '#5C6BC0', imageUri: null, aspect: 0.8,
      snapshot: mockSnapshot({ title: '전기 위험 스페셜리스트', emoji: '⚡', totalLearned: 240, masteredCount: 188, completionPct: 78, accuracyPct: 94, streakDays: 31, bestStreak: 31, level: 8, levelTitle: '안전 마이스터', topCategory: '전기 위험', topEmoji: '⚡', topCategoryPct: 92 }),
      likes: 42, likedByMe: false, reactions: { clap: 31, fire: 24, up: 12 }, myReactions: [], minutesAgo: 35,
    },
    {
      id: 'brag-2', author: '박현장', color: '#26A69A', imageUri: null, aspect: 0.8,
      snapshot: mockSnapshot({ title: '올라운드 마스터', emoji: '🧭', totalLearned: 180, masteredCount: 150, completionPct: 68, accuracyPct: 90, streakDays: 18, bestStreak: 24, level: 6, levelTitle: '베테랑 점검가', topCategory: '현장 점검', topEmoji: '📸', topCategoryPct: 80 }),
      likes: 27, likedByMe: false, reactions: { clap: 18, fire: 9, up: 15 }, myReactions: [], minutesAgo: 140,
    },
    {
      id: 'brag-3', author: '최예방', color: '#F2B705', imageUri: null, aspect: 0.8,
      snapshot: mockSnapshot({ title: '균형잡힌 점검가', emoji: '⚖️', totalLearned: 90, masteredCount: 72, completionPct: 45, accuracyPct: 85, streakDays: 7, bestStreak: 11, level: 4, levelTitle: '성장하는 점검가', topCategory: '위험물', topEmoji: '🔥', topCategoryPct: 61 }),
      likes: 15, likedByMe: false, reactions: { clap: 8, fire: 11, up: 6 }, myReactions: [], minutesAgo: 320,
    },
  ];
}

interface ShareFeedState {
  posts: ShareCardPost[];
  /** 성취 카드를 인앱 피드에 업로드한다(서버 전환 시 이 함수 본문만 교체). 반환값은 새 글 id. */
  uploadShareCard: (input: ShareCardUpload) => string;
  toggleLike: (id: string) => void;
  /** 퀵 리액션 토글(👏/🔥/👍). 서버 전환 시 POST /inner/api/v1/feed/:id/react 로 매핑. */
  react: (id: string, kind: ReactionKind) => void;
}

export const useShareFeedStore = create<ShareFeedState>()(
  persist(
    (set) => ({
      // 시드 글(김안전·박현장·최예방)은 목업 모드에서만 — 실서버 모드에서 보이면 지어낸
      // 사람의 지어낸 성취가 '다른 점검자의 자랑'으로 읽힌다(알림 시드와 같은 결함).
      posts: env.useMockData ? seed() : [],
      uploadShareCard: ({ author, color, imageUri, aspect, snapshot }) => {
        const id = `mybrag-${Date.now()}`;
        set((s) => ({
          posts: [
            { id, author, color, imageUri, aspect, snapshot, likes: 0, likedByMe: false, reactions: { clap: 0, fire: 0, up: 0 }, myReactions: [], mine: true, minutesAgo: 0, createdAt: Date.now() },
            ...s.posts,
          ],
        }));
        return id;
      },
      toggleLike: (id) =>
        set((s) => ({
          posts: s.posts.map((p) =>
            // 0 아래로 내려가지 않게 막는다 — 리액션(아래)은 이미 그렇게 하고 있는데
            // 좋아요만 빠져 있어, 시드가 '내가 눌렀음'인 채 0 인 글을 취소하면
            // 화면에 '-1' 이 그려진다.
            p.id === id
              ? { ...p, likedByMe: !p.likedByMe, likes: Math.max(0, p.likes + (p.likedByMe ? -1 : 1)) }
              : p,
          ),
        })),
      react: (id, kind) =>
        set((s) => ({
          posts: s.posts.map((p) => {
            if (p.id !== id) return p;
            const had = p.myReactions.includes(kind);
            return {
              ...p,
              reactions: { ...p.reactions, [kind]: Math.max(0, (p.reactions[kind] ?? 0) + (had ? -1 : 1)) },
              myReactions: had ? p.myReactions.filter((k) => k !== kind) : [...p.myReactions, kind],
            };
          }),
        })),
    }),
    {
      name: 'share-feed',
      version: 3,
      storage: createJSONStorage(() => AsyncStorage),
      migrate: (persisted: unknown, from: number) => {
        const state = persisted as { posts?: ShareCardPost[] } | undefined;
        // v1 → v2: 리액션 필드가 없던 기존 저장본에 기본값을 채운다.
        if (state?.posts && from < 2) {
          state.posts = state.posts.map((p) => ({
            ...p,
            reactions: p.reactions ?? { clap: 0, fire: 0, up: 0 },
            myReactions: p.myReactions ?? [],
          }));
        }
        // v2 → v3: 실서버 모드 기기에 이미 저장돼 버린 시드 글을 걷어 낸다
        // (전체 목록을 저장하던 탓에 한 번 들어간 시드가 계속 살아 있었다).
        if (state?.posts && from < 3 && !env.useMockData) {
          state.posts = state.posts.filter((p) => p.mine);
        }
        return state as ShareFeedState;
      },
    },
  ),
);
