import type { IEngagementRepository, EngagementSnapshot } from '../../domain/repositories/IEngagementRepository';
import { apiClient } from '../network/ApiClient';

interface EngagementDTO {
  liked_ids?: string[];
  bookmarked_ids?: string[];
}

/**
 * 카드 반응(추천·저장) 저장소(실서버).
 *  · GET  /inner/api/v1/engagement            → 내 반응 목록
 *  · POST /inner/api/v1/engagement/like       → { card_id, liked }
 *  · POST /inner/api/v1/engagement/bookmark   → { card_id, bookmarked }
 *
 * '토글'이 아니라 '원하는 상태'를 보내는 이유: 재전송돼도 결과가 같아야 하기 때문이다.
 * (토글을 두 번 보내면 원래대로 돌아가 버린다.)
 */
export class EngagementRepository implements IEngagementRepository {
  async pull(): Promise<EngagementSnapshot> {
    const dto = await apiClient.get<EngagementDTO>('/inner/api/v1/engagement');
    return {
      likedIds: dto.liked_ids ?? [],
      bookmarkedIds: dto.bookmarked_ids ?? [],
    };
  }

  async setLiked(cardId: string, liked: boolean): Promise<void> {
    await apiClient.postDurable(
      '/inner/api/v1/engagement/like',
      { card_id: cardId, liked },
      `like:${cardId}:${liked}`,
    );
  }

  async setBookmarked(cardId: string, bookmarked: boolean): Promise<void> {
    await apiClient.postDurable(
      '/inner/api/v1/engagement/bookmark',
      { card_id: cardId, bookmarked },
      `bookmark:${cardId}:${bookmarked}`,
    );
  }
}
