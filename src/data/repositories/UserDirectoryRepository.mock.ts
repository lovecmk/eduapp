import type { IUserDirectoryRepository } from '../../domain/repositories/IUserDirectoryRepository';
import type { PublicProfile, PublicProfileSummary, ProfileVisibility } from '../../domain/models/PublicProfile';
import type { MembershipTier } from '../../domain/models/User';
import { delay } from './_delay';

// 목업 사용자 원본 — 각자 실제 진행도 전체를 가지고 있고, 공개 범위(visibility)로
// 무엇을 보여줄지 스스로 정한다. getProfile 은 visibility 를 적용해 허용 값만 내보낸다.
interface RawUser {
  id: string;
  nickname: string;
  org?: string;
  jobTitle?: string;
  bio?: string;
  membership: MembershipTier;
  visibility: ProfileVisibility;
  // 실제(내부) 진행도 — visibility 에 따라 공개 여부가 결정된다.
  totalLearned: number;
  masteryPct: number;
  streakDays: number;
  emblems: { label: string; emoji: string; level: number }[];
  collectionCount: number;
}

const RAW: RawUser[] = [
  {
    id: 'u-wonjin', nickname: '불끄는진섭', org: 'KFPA 안전점검팀', jobTitle: '수석 점검자', bio: '현장이 답이다 🔥',
    membership: 'premium',
    visibility: { searchable: true, showProgress: true, showStreak: true, showEmblems: true, showCollection: true },
    totalLearned: 312, masteryPct: 74, streakDays: 21,
    emblems: [ { label: '전기 안전', emoji: '⚡', level: 3 }, { label: '위험물 관리', emoji: '🔥', level: 2 }, { label: '현장 점검', emoji: '📸', level: 3 } ],
    collectionCount: 24,
  },
  {
    id: 'u-yong', nickname: '용재쓰', org: '설비안전본부', jobTitle: '전기 담당',
    membership: 'basic',
    visibility: { searchable: true, showProgress: true, showStreak: true, showEmblems: false, showCollection: false },
    totalLearned: 138, masteryPct: 52, streakDays: 7,
    emblems: [ { label: '전기 안전', emoji: '⚡', level: 2 } ],
    collectionCount: 9,
  },
  {
    id: 'u-safe', nickname: '안전제일김', org: '현장안전1팀',
    membership: 'vip',
    visibility: { searchable: true, showProgress: true, showStreak: false, showEmblems: true, showCollection: false },
    totalLearned: 480, masteryPct: 88, streakDays: 45,
    emblems: [ { label: '공정 안전', emoji: '🎨', level: 3 }, { label: '위험물 관리', emoji: '🔥', level: 3 } ],
    collectionCount: 33,
  },
  {
    id: 'u-quiet', nickname: '조용한점검', org: '품질안전팀',
    membership: 'basic',
    // 진행도는 비공개, 검색만 허용 — '이 사용자는 진행도를 공개하지 않아요' 상태 시연.
    visibility: { searchable: true, showProgress: false, showStreak: false, showEmblems: false, showCollection: false },
    totalLearned: 60, masteryPct: 30, streakDays: 3,
    emblems: [], collectionCount: 2,
  },
  {
    id: 'u-park', nickname: '박점검러', org: '설비안전본부', jobTitle: '기계 담당',
    membership: 'premium',
    visibility: { searchable: true, showProgress: true, showStreak: true, showEmblems: true, showCollection: true },
    totalLearned: 205, masteryPct: 63, streakDays: 12,
    emblems: [ { label: '현장 점검', emoji: '📸', level: 2 }, { label: '공정 안전', emoji: '🎨', level: 1 } ],
    collectionCount: 15,
  },
];

const summaryOf = (u: RawUser): PublicProfileSummary => ({ id: u.id, nickname: u.nickname, org: u.org, membership: u.membership });

/** visibility 를 적용해 허용된 값만 담은 공개 프로필로 변환. */
function toPublic(u: RawUser): PublicProfile {
  const v = u.visibility;
  return {
    ...summaryOf(u),
    jobTitle: u.jobTitle,
    bio: u.bio,
    visibility: v,
    progress: v.showProgress ? { totalLearned: u.totalLearned, masteryPct: u.masteryPct } : undefined,
    streakDays: v.showStreak ? u.streakDays : undefined,
    emblems: v.showEmblems ? u.emblems : undefined,
    collectionCount: v.showCollection ? u.collectionCount : undefined,
  };
}

export class MockUserDirectoryRepository implements IUserDirectoryRepository {
  async search(query: string): Promise<PublicProfileSummary[]> {
    await delay(350);
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return RAW.filter((u) => u.visibility.searchable && u.nickname.toLowerCase().includes(q)).map(summaryOf);
  }

  async getProfile(id: string): Promise<PublicProfile | null> {
    await delay(300);
    const u = RAW.find((x) => x.id === id);
    return u ? toPublic(u) : null;
  }
}
