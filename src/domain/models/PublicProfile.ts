import type { MembershipTier } from './User';

// 공개 프로필 & 공개 범위 — 닉네임 검색으로 다른 점검자의 진행도를 '허용한 범위까지만' 보여준다.
// 각 사용자는 무엇을 공개할지 스스로 정한다(ProfileVisibility). 공개하지 않은 값은
// 응답/화면에서 아예 빠진다(undefined) — 서버도 클라이언트도 비공개 값을 노출하지 않는다.

export interface ProfileVisibility {
  /** 닉네임 검색 결과에 노출될지 여부(꺼두면 검색되지 않음). */
  searchable: boolean;
  /** 누적 학습·완료율 공개. */
  showProgress: boolean;
  /** 연속 학습(스트릭) 공개. */
  showStreak: boolean;
  /** 엠블럼(분야별 실력) 공개. */
  showEmblems: boolean;
  /** 안전 카드 컬렉션 수 공개. */
  showCollection: boolean;
}

/** 기본 공개 범위 — 진행도·스트릭·엠블럼은 공개, 컬렉션은 비공개(과공유 방지). */
export const DEFAULT_VISIBILITY: ProfileVisibility = {
  searchable: true,
  showProgress: true,
  showStreak: true,
  showEmblems: true,
  showCollection: false,
};

export interface PublicEmblem {
  label: string;
  emoji: string;
  level: number; // 0~3
}

/** 검색 결과에 쓰이는 요약(가벼운) 프로필. */
export interface PublicProfileSummary {
  id: string;
  nickname: string;
  org?: string;
  membership: MembershipTier;
}

/** 공개 프로필 상세 — 공개하지 않은 필드는 undefined 로 온다(허용 범위까지만). */
export interface PublicProfile extends PublicProfileSummary {
  jobTitle?: string;
  bio?: string;
  /** 이 프로필이 무엇을 공개하는지(화면이 '비공개' 안내를 그릴 때 사용). */
  visibility: ProfileVisibility;
  /** 누적 학습·완료율 — showProgress 일 때만. */
  progress?: { totalLearned: number; masteryPct: number };
  /** 연속 학습 일수 — showStreak 일 때만. */
  streakDays?: number;
  /** 엠블럼 — showEmblems 일 때만. */
  emblems?: PublicEmblem[];
  /** 컬렉션 보유 수 — showCollection 일 때만. */
  collectionCount?: number;
}
