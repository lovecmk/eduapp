import type { PublicProfile, PublicProfileSummary } from '../models/PublicProfile';

/**
 * 사용자 디렉터리 — 닉네임 검색과 공개 프로필 조회.
 * 각 사용자의 공개 범위(ProfileVisibility)는 서버가 적용해서 내려주는 것이 원칙이다
 * (비공개 값은 응답에 아예 포함되지 않도록). 목업도 동일하게 동작한다.
 *
 * 실서버 연동 시:
 *  · search(q)      → GET /inner/api/v1/users/search?q=
 *  · getProfile(id) → GET /inner/api/v1/users/:id/public
 */
export interface IUserDirectoryRepository {
  /** 닉네임(부분 일치) 검색 — 검색 허용(searchable) 사용자만 반환. */
  search(query: string): Promise<PublicProfileSummary[]>;
  /** 공개 프로필 상세 — 허용 범위까지만 채워져 온다(없으면 null). */
  getProfile(id: string): Promise<PublicProfile | null>;
}
