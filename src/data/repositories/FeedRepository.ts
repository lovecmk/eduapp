import type { IFeedRepository } from '../../domain/repositories/IFeedRepository';
import type { ReactionKind, ShareCardPost, ShareCardUpload } from '../../domain/models/Feed';
import { REACTION_KINDS } from '../../domain/models/Feed';
import { authorColor } from '../../domain/models/Qna';
import type { AchievementSnapshot } from '../../utils/achievement';
import { apiClient } from '../network/ApiClient';
import { parseDate } from '../mappers/_date';

interface FeedPostDTO {
  id: string | number;
  author_nm?: string;
  snapshot: AchievementSnapshot;
  aspect?: number;
  reactions?: Partial<Record<ReactionKind, number>>;
  my_reactions?: string[];
  mine_yn?: boolean;
  created_at?: string;
}

function toDomain(d: FeedPostDTO): ShareCardPost {
  const author = d.author_nm?.trim() || '익명';
  const reactions = { clap: 0, fire: 0, up: 0 } as Record<ReactionKind, number>;
  for (const k of REACTION_KINDS) reactions[k] = Math.max(0, Math.trunc(d.reactions?.[k] ?? 0));
  return {
    id: String(d.id),
    author,
    color: authorColor(author),
    imageUri: null, // 서버는 스냅샷만 준다 — 카드는 기기에서 다시 그린다.
    aspect: typeof d.aspect === 'number' && d.aspect > 0 ? d.aspect : 0.8,
    snapshot: d.snapshot,
    likes: 0,
    likedByMe: false,
    reactions,
    myReactions: (d.my_reactions ?? []).filter((k): k is ReactionKind => (REACTION_KINDS as string[]).includes(k)),
    mine: d.mine_yn === true,
    minutesAgo: 0,
    createdAt: parseDate(d.created_at)?.getTime(),
  };
}

/**
 * 자랑 피드(실서버) — docs/BACKEND_TODO §1.
 *  · GET  /inner/api/v1/feed                       → 최신순(최근 30일 · 최대 50건)
 *  · POST /inner/api/v1/feed                       { snapshot, aspect } → 글
 *  · POST /inner/api/v1/feed/:id/reactions         { kind, on }  (멱등키)
 * 이미지는 올리지 않는다(domain/models/Feed 주석).
 */
export class FeedRepository implements IFeedRepository {
  async list(): Promise<ShareCardPost[]> {
    const dto = await apiClient.get<FeedPostDTO[]>('/inner/api/v1/feed');
    return Array.isArray(dto) ? dto.filter((d) => d && d.snapshot).map(toDomain) : [];
  }

  async post(input: ShareCardUpload): Promise<ShareCardPost> {
    const dto = await apiClient.post<FeedPostDTO>('/inner/api/v1/feed', { snapshot: input.snapshot, aspect: input.aspect });
    // 방금 캡처한 이미지는 이 기기에서만 쓰는 사본으로 붙여 둔다.
    return { ...toDomain(dto), imageUri: input.imageUri, mine: true };
  }

  async setReaction(postId: string, kind: ReactionKind, on: boolean): Promise<void> {
    await apiClient.postDurable(
      `/inner/api/v1/feed/${encodeURIComponent(postId)}/reactions`,
      { kind, on },
      `feed-react:${postId}:${kind}:${on}`,
    );
  }
}
