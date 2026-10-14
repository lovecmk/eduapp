import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReactionKind, ShareCardPost } from '../domain/models/Feed';
import { withReaction } from '../domain/models/Feed';

// 자랑 피드의 **로컬 사본** — 서버(`/inner/api/v1/feed`)에 닿지 못하거나 목업 모드일 때
// FeedRepository 폴백(MockFeedRepository)이 이 스토어를 원천으로 쓴다. 화면은 이 스토어를
// 직접 읽지 않는다(hooks/useFeed). 모델은 domain/models/Feed 로 옮겼다.
export type { ReactionKind, ShareCardPost, ShareCardUpload } from '../domain/models/Feed';
export { REACTION_KINDS, REACTION_EMOJI, postMinutesAgo } from '../domain/models/Feed';

interface ShareFeedState {
  posts: ShareCardPost[];
  /** 글 하나를 맨 앞에 더한다. */
  add: (post: ShareCardPost) => void;
  /** 리액션 상태 설정(토글 아님 — 재전송돼도 같은 결과). */
  setReaction: (id: string, kind: ReactionKind, on: boolean) => void;
  /** 서버로 옮긴 로컬 글을 지운다(data/sync/localBackfill). */
  remove: (id: string) => void;
}

export const useShareFeedStore = create<ShareFeedState>()(
  persist(
    (set) => ({
      // 시드 글(김안전·박현장·최예방)은 목업 모드에서만 — 실서버 모드에서 보이면 지어낸
      // 사람의 지어낸 성취가 '다른 점검자의 자랑'으로 읽힌다(알림 시드와 같은 결함).
      posts: [],
      add: (post) => set((s) => ({ posts: [post, ...s.posts.filter((p) => p.id !== post.id)] })),
      remove: (id) => set((s) => ({ posts: s.posts.filter((p) => p.id !== id) })),
      setReaction: (id, kind, on) =>
        set((s) => ({ posts: s.posts.map((p) => (p.id === id ? withReaction(p, kind, on) : p)) })),
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
        if (state?.posts && from < 3) {
          state.posts = state.posts.filter((p) => p.mine);
        }
        return state as ShareFeedState;
      },
    },
  ),
);
