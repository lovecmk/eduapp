// Layer 2: Domain Model — PART 1.2
export type MembershipTier = 'basic' | 'premium' | 'vip';

export interface User {
  id: string;
  name: string;
  email: string;
  org?: string; // 소속
  jobTitle?: string; // 직무
  membership: MembershipTier; // 계정 등급
  createdAt: Date;
  isActive: boolean;
}

export const MEMBERSHIP_META: Record<
  MembershipTier,
  { label: string; icon: string; accent: string }
> = {
  basic: { label: 'Basic', icon: 'person-outline', accent: '#8E95A2' },
  premium: { label: 'Premium', icon: 'star', accent: '#2563EB' },
  vip: { label: 'VIP', icon: 'diamond', accent: '#A855F7' },
};
