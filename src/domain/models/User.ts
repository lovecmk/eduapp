// Layer 2: Domain Model — PART 1.2
export type MembershipTier = 'basic' | 'premium' | 'vip';

export interface User {
  id: string;
  /** 로그인 아이디(변경 불가, 표시 전용). */
  loginId?: string;
  name: string;
  /** 공개 닉네임(커뮤니티·프로필 표시명). 미설정 시 name 으로 폴백. */
  nickname?: string;
  email: string;
  org?: string; // 소속
  jobTitle?: string; // 직무
  membership: MembershipTier; // 계정 등급
  createdAt: Date;
  isActive: boolean;
}

/** 화면에 노출할 표시명 — 닉네임이 있으면 닉네임, 없으면 이름. */
export function displayName(user?: Pick<User, 'name' | 'nickname'> | null): string {
  if (!user) return '현장 작업자';
  return user.nickname?.trim() || user.name?.trim() || '현장 작업자';
}

export const MEMBERSHIP_META: Record<
  MembershipTier,
  { label: string; icon: string; accent: string }
> = {
  basic: { label: 'Basic', icon: 'person-outline', accent: '#8E95A2' },
  premium: { label: 'Premium', icon: 'star', accent: '#2563EB' },
  vip: { label: 'VIP', icon: 'diamond', accent: '#A855F7' },
};
