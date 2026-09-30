import type { ReactionKind, ShareCardPost, ShareCardUpload } from '../models/Feed';

/**
 * 자랑 피드 저장소 — 서버 `/inner/api/v1/feed`(미배포 → 이 기기 안에서 도는 폴백).
 * 리액션은 토글이 아니라 **원하는 상태**(on)를 보낸다 — 재전송돼도 결과가 같다.
 */
export interface IFeedRepository {
  /** 최신순 글 목록(내 글 포함, mine 으로 구분). */
  list(): Promise<ShareCardPost[]>;
  post(input: ShareCardUpload): Promise<ShareCardPost>;
  setReaction(postId: string, kind: ReactionKind, on: boolean): Promise<void>;
}
