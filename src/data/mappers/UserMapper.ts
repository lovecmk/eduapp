// Mapper 레이어 (신뢰 경계의 검문소) — PART 1.3
// 서버 데이터는 검증/변환을 거친 후에만 앱의 '진실'이 된다.
import type { UserDTO } from '../dto/UserDTO';
import type { User, MembershipTier } from '../../domain/models/User';

const MEMBERSHIP_MAP: Record<NonNullable<UserDTO['membership_cd']>, MembershipTier> = {
  BASIC: 'basic',
  PREMIUM: 'premium',
  VIP: 'vip',
};

export class UserMapper {
  static toDomain(dto: UserDTO): User {
    if (__DEV__ && !['A', 'I', 'D'].includes(dto.status_cd)) {
      console.warn(`[UserMapper] 알 수 없는 status_cd: ${dto.status_cd} (id=${dto.id})`);
    }
    return {
      id: String(dto.id),
      loginId: dto.login_id?.trim() || undefined,
      name: dto.user_nm?.trim() ?? '(이름 없음)',
      nickname: dto.nickname?.trim() || undefined,
      email: dto.email_addr,
      org: dto.org_nm?.trim(),
      jobTitle: dto.job_title?.trim(),
      membership: dto.membership_cd ? MEMBERSHIP_MAP[dto.membership_cd] : 'basic',
      createdAt: new Date(dto.created_at),
      isActive: dto.status_cd === 'A',
    };
  }

  static toDomainList(dtos: UserDTO[]): User[] {
    return dtos.map(UserMapper.toDomain);
  }
}
