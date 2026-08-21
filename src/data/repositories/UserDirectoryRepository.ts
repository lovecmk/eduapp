import type { IUserDirectoryRepository } from '../../domain/repositories/IUserDirectoryRepository';
import type { PublicProfile, PublicProfileSummary, ProfileVisibility } from '../../domain/models/PublicProfile';
import type { MembershipTier } from '../../domain/models/User';
import { apiClient } from '../network/ApiClient';

interface SummaryDTO {
  id: string;
  nickname: string;
  org?: string;
  membership?: MembershipTier;
}
interface ProfileDTO extends SummaryDTO {
  job_title?: string;
  bio?: string;
  visibility?: Partial<ProfileVisibility>;
  progress?: { total_learned: number; mastery_pct: number };
  streak_days?: number;
  emblems?: { label: string; emoji: string; level: number }[];
  collection_count?: number;
}

/**
 * 실서버 사용자 디렉터리.
 *  · search(q)      → GET /inner/api/v1/users/search?q=
 *  · getProfile(id) → GET /inner/api/v1/users/:id/public
 *
 * 서버가 각 사용자의 공개 범위를 적용해 '허용한 값만' 내려주는 것을 전제로 한다
 * (비공개 필드는 응답에서 생략). 클라이언트는 온 값만 그린다.
 */
export class UserDirectoryRepository implements IUserDirectoryRepository {
  async search(query: string): Promise<PublicProfileSummary[]> {
    const q = query.trim();
    if (!q) return [];
    const list = await apiClient.get<SummaryDTO[]>(`/inner/api/v1/users/search?q=${encodeURIComponent(q)}`);
    return (list ?? []).map((d) => ({ id: d.id, nickname: d.nickname, org: d.org, membership: d.membership ?? 'basic' }));
  }

  async getProfile(id: string): Promise<PublicProfile | null> {
    const d = await apiClient.get<ProfileDTO | null>(`/inner/api/v1/users/${encodeURIComponent(id)}/public`);
    if (!d) return null;
    const visibility: ProfileVisibility = {
      searchable: d.visibility?.searchable ?? true,
      showProgress: d.visibility?.showProgress ?? !!d.progress,
      showStreak: d.visibility?.showStreak ?? d.streak_days != null,
      showEmblems: d.visibility?.showEmblems ?? !!d.emblems,
      showCollection: d.visibility?.showCollection ?? d.collection_count != null,
    };
    return {
      id: d.id,
      nickname: d.nickname,
      org: d.org,
      membership: d.membership ?? 'basic',
      jobTitle: d.job_title,
      bio: d.bio,
      visibility,
      progress: d.progress ? { totalLearned: d.progress.total_learned, masteryPct: d.progress.mastery_pct } : undefined,
      streakDays: d.streak_days,
      emblems: d.emblems,
      collectionCount: d.collection_count,
    };
  }
}
