import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AchievementSnapshot } from '../utils/achievement';

// 인앱 커뮤니티 '자랑 피드' — 완성된 성취 카드를 외부 SNS 대신 앱 내부에 올려
// 유저끼리 서로를 증명·자랑한다. 클라이언트에서 카드를 이미지화(react-native-view-shot)해
// imageUri 로 올리므로, 추후 내부 서버 전환 시 uploadShareCard 한 곳만 교체하면 된다.
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
  mine?: boolean;
  /** 상대 시간(분) */
  minutesAgo: number;
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
      likes: 42, likedByMe: false, minutesAgo: 35,
    },
    {
      id: 'brag-2', author: '박현장', color: '#26A69A', imageUri: null, aspect: 0.8,
      snapshot: mockSnapshot({ title: '올라운드 마스터', emoji: '🧭', totalLearned: 180, masteredCount: 150, completionPct: 68, accuracyPct: 90, streakDays: 18, bestStreak: 24, level: 6, levelTitle: '베테랑 점검가', topCategory: '현장 점검', topEmoji: '📸', topCategoryPct: 80 }),
      likes: 27, likedByMe: false, minutesAgo: 140,
    },
    {
      id: 'brag-3', author: '최예방', color: '#F2B705', imageUri: null, aspect: 0.8,
      snapshot: mockSnapshot({ title: '균형잡힌 점검가', emoji: '⚖️', totalLearned: 90, masteredCount: 72, completionPct: 45, accuracyPct: 85, streakDays: 7, bestStreak: 11, level: 4, levelTitle: '성장하는 점검가', topCategory: '위험물', topEmoji: '🔥', topCategoryPct: 61 }),
      likes: 15, likedByMe: false, minutesAgo: 320,
    },
  ];
}

interface ShareFeedState {
  posts: ShareCardPost[];
  /** 성취 카드를 인앱 피드에 업로드한다(서버 전환 시 이 함수 본문만 교체). 반환값은 새 글 id. */
  uploadShareCard: (input: ShareCardUpload) => string;
  toggleLike: (id: string) => void;
}

export const useShareFeedStore = create<ShareFeedState>()(
  persist(
    (set) => ({
      posts: seed(),
      uploadShareCard: ({ author, color, imageUri, aspect, snapshot }) => {
        const id = `mybrag-${Date.now()}`;
        set((s) => ({
          posts: [
            { id, author, color, imageUri, aspect, snapshot, likes: 0, likedByMe: false, mine: true, minutesAgo: 0 },
            ...s.posts,
          ],
        }));
        return id;
      },
      toggleLike: (id) =>
        set((s) => ({
          posts: s.posts.map((p) =>
            p.id === id ? { ...p, likedByMe: !p.likedByMe, likes: p.likes + (p.likedByMe ? -1 : 1) } : p,
          ),
        })),
    }),
    { name: 'share-feed', version: 1, storage: createJSONStorage(() => AsyncStorage) },
  ),
);
