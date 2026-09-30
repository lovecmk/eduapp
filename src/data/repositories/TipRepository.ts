import type { ITipRepository } from '../../domain/repositories/ITipRepository';
import type { CardTip } from '../../domain/models/CardTip';
import { authorColor } from '../../domain/models/Qna';
import { apiClient } from '../network/ApiClient';
import { parseDate } from '../mappers/_date';
import { sanitizeText, INPUT_LIMITS } from '../../utils/sanitize';

interface TipDTO {
  id: string | number;
  card_id: string;
  author_nm?: string;
  body_txt: string;
  like_cnt?: number;
  liked_yn?: boolean;
  mine_yn?: boolean;
  created_at?: string;
}

function toDomain(d: TipDTO): CardTip {
  const author = d.author_nm?.trim() || '익명';
  return {
    id: String(d.id),
    cardId: d.card_id,
    author,
    color: authorColor(author),
    body: d.body_txt ?? '',
    likes: Math.max(0, d.like_cnt ?? 0),
    likedByMe: d.liked_yn === true,
    mine: d.mine_yn === true,
    minutesAgo: 0,
    createdAt: parseDate(d.created_at)?.getTime(),
  };
}

/**
 * 현장 팁(실서버) — docs/BACKEND_TODO §2.
 *  · GET    /inner/api/v1/cards/:cardId/tips
 *  · POST   /inner/api/v1/cards/:cardId/tips        { body }
 *  · POST   /inner/api/v1/tips/:id/like             { liked }   (멱등키)
 *  · DELETE /inner/api/v1/tips/:id                   (내 팁만)
 * 라우트가 없으면 repositories/index 의 withMockFallback 이 이 기기 안(tipStore)으로 돌린다.
 */
export class TipRepository implements ITipRepository {
  async list(cardId: string): Promise<CardTip[]> {
    const dto = await apiClient.get<TipDTO[]>(`/inner/api/v1/cards/${encodeURIComponent(cardId)}/tips`);
    return Array.isArray(dto) ? dto.map(toDomain) : [];
  }

  async add(cardId: string, body: string): Promise<CardTip> {
    const clean = sanitizeText(body, { maxLength: INPUT_LIMITS.tip, allowNewlines: true });
    const dto = await apiClient.post<TipDTO>(`/inner/api/v1/cards/${encodeURIComponent(cardId)}/tips`, { body: clean });
    return toDomain(dto);
  }

  async setLike(tipId: string, liked: boolean): Promise<void> {
    await apiClient.postDurable(`/inner/api/v1/tips/${encodeURIComponent(tipId)}/like`, { liked }, `tip-like:${tipId}:${liked}`);
  }

  async remove(tipId: string): Promise<void> {
    await apiClient.delete(`/inner/api/v1/tips/${encodeURIComponent(tipId)}`);
  }
}
