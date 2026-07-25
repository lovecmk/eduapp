import { UserMapper } from '../UserMapper';
import type { UserDTO } from '../../dto/UserDTO';

(globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;

const base: UserDTO = {
  id: 42,
  user_nm: '  원진섭 ',
  email_addr: 'won@example.com',
  created_at: '2026-01-01T00:00:00.000Z',
  status_cd: 'A',
};

describe('UserMapper.toDomain', () => {
  it('숫자 id 를 문자열로, snake_case 를 camelCase 로 매핑한다', () => {
    const u = UserMapper.toDomain({ ...base, org_nm: '안전관리본부', job_title: '대리', membership_cd: 'PREMIUM' });
    expect(u.id).toBe('42');
    expect(typeof u.id).toBe('string');
    expect(u.name).toBe('원진섭');
    expect(u.email).toBe('won@example.com');
    expect(u.org).toBe('안전관리본부');
    expect(u.jobTitle).toBe('대리');
    expect(u.membership).toBe('premium');
    expect(u.isActive).toBe(true);
  });

  it('membership_cd 누락 시 basic 으로 폴백', () => {
    expect(UserMapper.toDomain(base).membership).toBe('basic');
  });

  it('status_cd 가 A 가 아니면 isActive=false', () => {
    expect(UserMapper.toDomain({ ...base, status_cd: 'D' }).isActive).toBe(false);
  });

  it('user_nm 이 빈 문자열이면 "(이름 없음)" 폴백', () => {
    expect(UserMapper.toDomain({ ...base, user_nm: '   ' }).name).toBe('(이름 없음)');
  });

  it('유효한 created_at 은 Date 로 파싱', () => {
    expect(UserMapper.toDomain(base).createdAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('[F3] 파싱 불가한 created_at 은 epoch 로 폴백 (Invalid Date 아님)', () => {
    const u = UserMapper.toDomain({ ...base, created_at: 'not-a-date' });
    expect(Number.isNaN(u.createdAt.getTime())).toBe(false);
    expect(u.createdAt.getTime()).toBe(0);
  });

  it('nickname 은 있으면 트림, 빈 값이면 undefined', () => {
    expect(UserMapper.toDomain({ ...base, nickname: ' 현장왕 ' }).nickname).toBe('현장왕');
    expect(UserMapper.toDomain({ ...base, nickname: '  ' }).nickname).toBeUndefined();
  });
});
