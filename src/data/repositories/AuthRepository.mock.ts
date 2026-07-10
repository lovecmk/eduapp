// TODO: 실제 API 연동 필요 - 담당: 백엔드팀 (POST /api/auth/login, /api/auth/refresh)
import type { IAuthRepository, AuthSession } from '../../domain/repositories/IAuthRepository';
import type { User } from '../../domain/models/User';
import { secureStorage, StorageKeys } from '../storage/secureStorage';
import { delay } from './_delay';

const MOCK_USER: User = {
  id: '1',
  name: '김현장',
  email: 'kim@example.com',
  org: '안전관리본부',
  jobTitle: '현장 안전관리자',
  membership: 'premium',
  createdAt: new Date('2025-01-01'),
  isActive: true,
};

// 데모 자격증명 — 아무 값이나 입력해도 로그인되지만, 빈 값은 막는다.
export class MockAuthRepository implements IAuthRepository {
  async login(id: string, password: string): Promise<AuthSession> {
    await delay(500);
    if (!id.trim() || !password.trim()) {
      throw new Error('아이디와 비밀번호를 모두 입력하세요');
    }
    if (password.length < 4) {
      throw new Error('비밀번호는 4자 이상이어야 합니다');
    }
    const session: AuthSession = {
      user: { ...MOCK_USER, name: id.trim() || MOCK_USER.name },
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
    };
    await secureStorage.setItem(StorageKeys.accessToken, session.accessToken);
    await secureStorage.setItem(StorageKeys.refreshToken, session.refreshToken);
    return session;
  }

  async logout(): Promise<void> {
    await delay(150);
    await secureStorage.removeItem(StorageKeys.accessToken);
    await secureStorage.removeItem(StorageKeys.refreshToken);
  }

  async restore(): Promise<User | null> {
    const token = await secureStorage.getItem(StorageKeys.accessToken);
    if (!token) return null;
    await delay(200);
    return MOCK_USER;
  }
}
