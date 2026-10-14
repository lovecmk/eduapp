import type { IEngagementRepository, EngagementSnapshot } from '../../../../domain/repositories/IEngagementRepository';
import { useLikeStore } from '../../../../store/likeStore';
import { useBookmarkStore } from '../../../../store/bookmarkStore';
import { delay } from '../../../../data/repositories/_delay';

/** 목업 반응 저장소 — 로컬 스토어를 원천으로 사용한다. */
export class MockEngagementRepository implements IEngagementRepository {
  async pull(): Promise<EngagementSnapshot> {
    await delay(120);
    return {
      likedIds: useLikeStore.getState().ids,
      bookmarkedIds: useBookmarkStore.getState().ids,
    };
  }

  async setLiked(_cardId: string, _liked: boolean): Promise<void> {
    await delay(50); // 로컬 토글은 화면에서 이미 수행됨
  }

  async setBookmarked(_cardId: string, _bookmarked: boolean): Promise<void> {
    await delay(50);
  }
}
