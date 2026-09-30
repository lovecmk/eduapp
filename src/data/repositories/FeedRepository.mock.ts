import type { IFeedRepository } from '../../domain/repositories/IFeedRepository';
import type { ReactionKind, ShareCardPost, ShareCardUpload } from '../../domain/models/Feed';
import { useShareFeedStore } from '../../store/shareFeedStore';
import { useAuthStore } from '../../store/authStore';
import { authorLabel } from '../../domain/models/User';
import { delay } from './_delay';

/** 자랑 피드 — 이 기기 안(shareFeedStore). 목업 모드와 서버 미배포 폴백이 쓴다. */
export class MockFeedRepository implements IFeedRepository {
  async list(): Promise<ShareCardPost[]> {
    await delay(60);
    const me = useAuthStore.getState().user;
    return useShareFeedStore.getState().posts.map((p) => ({ ...p, author: authorLabel(p.author, p.mine, me) }));
  }

  async post({ author, color, imageUri, aspect, snapshot }: ShareCardUpload): Promise<ShareCardPost> {
    await delay(120);
    const post: ShareCardPost = {
      id: `mybrag-${Date.now()}`,
      author, color, imageUri, aspect, snapshot,
      likes: 0, likedByMe: false,
      reactions: { clap: 0, fire: 0, up: 0 }, myReactions: [],
      mine: true, minutesAgo: 0, createdAt: Date.now(),
    };
    useShareFeedStore.getState().add(post);
    return post;
  }

  async setReaction(postId: string, kind: ReactionKind, on: boolean): Promise<void> {
    await delay(30);
    useShareFeedStore.getState().setReaction(postId, kind, on);
  }
}
