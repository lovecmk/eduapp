/**
 * 카드에 대한 가벼운 반응 — 추천(좋아요)·저장(북마크).
 *
 * 로컬에만 두면 기기를 바꿨을 때 '저장한 카드'가 사라지고,
 * 추천 수를 커뮤니티 통계에 집계할 수도 없다.
 */
export interface EngagementSnapshot {
  /** 내가 추천한 카드 id 목록 */
  likedIds: string[];
  /** 내가 저장한 카드 id 목록 */
  bookmarkedIds: string[];
}

export interface IEngagementRepository {
  /** 내 반응 목록을 서버에서 가져온다. */
  pull(): Promise<EngagementSnapshot>;
  /** 추천 상태를 설정한다(토글 결과를 그대로 전달 — 재전송해도 같은 결과). */
  setLiked(cardId: string, liked: boolean): Promise<void>;
  /** 저장 상태를 설정한다. */
  setBookmarked(cardId: string, bookmarked: boolean): Promise<void>;
}
