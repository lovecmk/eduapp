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
  /**
   * 관리자인가 — 문제 등록처럼 관리자만 쓸 수 있는 기능을 화면에 보일지 결정한다.
   *
   * 이 값으로 화면을 숨기는 것은 **친절이지 권한이 아니다**. 실제 차단은 서버가
   * 하고 있고(관리자가 아니면 403), 여기서는 눌러 봐야 실패할 버튼을 미리
   * 치워 주는 역할만 한다.
   */
  isAdmin: boolean;
  createdAt: Date;
  isActive: boolean;
}

/** 화면에 노출할 표시명 — 닉네임이 있으면 닉네임, 없으면 이름. */
export function displayName(user?: Pick<User, 'name' | 'nickname'> | null): string {
  if (!user) return '현장 작업자';
  return user.nickname?.trim() || user.name?.trim() || '현장 작업자';
}

export interface MembershipMeta {
  label: string;
  icon: string;
  accent: string;
}

export const MEMBERSHIP_META: Record<MembershipTier, MembershipMeta> = {
  basic: { label: 'Basic', icon: 'person-outline', accent: '#8E95A2' },
  premium: { label: 'Premium', icon: 'star', accent: '#2563EB' },
  vip: { label: 'VIP', icon: 'diamond', accent: '#A855F7' },
};

/**
 * 등급 표시값을 **반드시 돌려주는** 조회 — 화면은 이쪽만 쓴다.
 *
 * `MEMBERSHIP_META[tier]` 를 직접 읽으면 tier 가 아는 값이 아닐 때 undefined 가 나오고,
 * 바로 뒤의 `.accent` 에서 화면 전체가 죽는다(MY 탭이 그렇게 죽었다). 매퍼에서 이미
 * 걸러내지만 그것만으로는 부족하다 — 기기에 **이미 저장된** 사용자는 예전 매퍼가 넣은
 * 잘못된 값을 그대로 들고 있어서, 고친 앱으로 올려도 다시 로그인하기 전까지 계속 죽는다.
 *
 * 등급은 배지 하나를 칠하는 값이다. 그것 때문에 화면이 사라지면 안 된다.
 */
export function membershipMeta(tier: MembershipTier | undefined | null): MembershipMeta {
  return (tier && MEMBERSHIP_META[tier]) || MEMBERSHIP_META.basic;
}
