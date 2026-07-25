// TODO: 실제 API 연동 필요 - 담당: 백엔드팀 (POST /api/auth/login, /register, /reset-password)
import type { IAuthRepository, AuthSession, SignupInput, ProfileUpdateInput, EmailCodeRequestResult } from '../../domain/repositories/IAuthRepository';
import type { User } from '../../domain/models/User';
import { secureStorage, StorageKeys } from '../storage/secureStorage';
import { mockUserDb } from '../auth/mockUserDb';
import { delay } from './_delay';

/**
 * 목업 인증 — AsyncStorage 기반 사용자 레지스트리(mockUserDb)를 사용해
 * 회원가입/로그인/비밀번호 찾기를 실제처럼 검증한다.
 */
export class MockAuthRepository implements IAuthRepository {
  /**
   * 이메일 인증코드 보관소(데모) — 실서버에서는 서버가 갖는 상태다.
   * 화면(컴포넌트)이 코드를 들고 비교하지 않도록 저장소 안에 둔다.
   */
  private emailCodes = new Map<string, { code: string; expiresAt: number; attempts: number }>();

  private static readonly CODE_TTL_MS = 5 * 60 * 1000; // 5분
  private static readonly MAX_ATTEMPTS = 5; // 무차별 대입 방지

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  async requestEmailCode(email: string): Promise<EmailCodeRequestResult> {
    await delay(400);
    const key = this.normalizeEmail(email);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    this.emailCodes.set(key, {
      code,
      expiresAt: Date.now() + MockAuthRepository.CODE_TTL_MS,
      attempts: 0,
    });
    // 목업에서만 화면에 표시할 코드를 돌려준다(실서버 구현은 절대 반환하지 않음).
    return { devPreviewCode: code };
  }

  async verifyEmailCode(email: string, code: string): Promise<boolean> {
    await delay(250);
    const key = this.normalizeEmail(email);
    const entry = this.emailCodes.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.emailCodes.delete(key); // 만료 코드는 폐기
      return false;
    }
    if (entry.attempts >= MockAuthRepository.MAX_ATTEMPTS) {
      this.emailCodes.delete(key); // 시도 초과 시 코드 무효화 → 재발송 필요
      return false;
    }
    entry.attempts += 1;
    const ok = entry.code === code.trim();
    if (ok) this.emailCodes.delete(key); // 1회용(재사용 방지)
    return ok;
  }

  private async persistSession(user: User): Promise<AuthSession> {
    const session: AuthSession = {
      user,
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
    };
    await secureStorage.setItem(StorageKeys.accessToken, session.accessToken);
    await secureStorage.setItem(StorageKeys.refreshToken, session.refreshToken);
    await secureStorage.setItem(StorageKeys.mockUser, JSON.stringify(session.user));
    return session;
  }

  async login(id: string, password: string): Promise<AuthSession> {
    await delay(400);
    if (!id.trim() || !password.trim()) {
      throw new Error('아이디와 비밀번호를 모두 입력하세요');
    }
    const account = await mockUserDb.find(id);
    if (!account) {
      throw new Error('가입되지 않은 아이디입니다');
    }
    if (account.password !== password) {
      throw new Error('비밀번호가 일치하지 않습니다');
    }
    return this.persistSession(account.user);
  }

  async socialLogin(name: string, email: string): Promise<AuthSession> {
    await delay(350);
    // 이름으로 기존 계정을 찾고, 없으면 데모 계정을 즉석에서 만든다.
    let account = await mockUserDb.find(name);
    if (!account) {
      const user: User = {
        id: `u-${Date.now()}`,
        loginId: name,
        name,
        nickname: name,
        email,
        org: '안전관리본부',
        jobTitle: undefined,
        membership: 'premium',
        createdAt: new Date(),
        isActive: true,
      };
      await mockUserDb.create({ username: name, password: `social-${Math.random().toString(36).slice(2)}`, user });
      account = { username: name, password: '', user };
    }
    return this.persistSession(account.user);
  }

  async register(input: SignupInput): Promise<AuthSession> {
    await delay(500);
    const user: User = {
      id: `u-${Date.now()}`,
      loginId: input.username.trim(),
      name: input.name.trim(),
      nickname: input.nickname.trim() || undefined,
      email: input.email.trim(),
      org: input.org?.trim() || undefined,
      jobTitle: undefined,
      membership: 'basic',
      createdAt: new Date(),
      isActive: true,
    };
    await mockUserDb.create({ username: input.username.trim(), password: input.password, user });
    return this.persistSession(user);
  }

  async isNicknameTaken(nickname: string, excludeUserId?: string): Promise<boolean> {
    if (!nickname.trim()) return false;
    return mockUserDb.isNicknameTaken(nickname, excludeUserId);
  }

  async updateProfile(userId: string, patch: ProfileUpdateInput): Promise<User> {
    await delay(400);
    const clean: Partial<User> = {};
    if (patch.name !== undefined) clean.name = patch.name.trim();
    if (patch.nickname !== undefined) clean.nickname = patch.nickname.trim() || undefined;
    if (patch.email !== undefined) clean.email = patch.email.trim();
    if (patch.org !== undefined) clean.org = patch.org.trim() || undefined;
    if (patch.jobTitle !== undefined) clean.jobTitle = patch.jobTitle.trim() || undefined;
    const updated = await mockUserDb.updateUser(userId, clean);
    // 세션 캐시(secureStorage)도 갱신해 앱 재시작(restore) 후에도 유지되게 한다.
    await secureStorage.setItem(StorageKeys.mockUser, JSON.stringify(updated));
    return updated;
  }

  async resetPassword(username: string, email: string, newPassword: string): Promise<void> {
    await delay(500);
    await mockUserDb.updatePassword(username, email, newPassword);
  }

  async isUsernameTaken(username: string): Promise<boolean> {
    if (!username.trim()) return false;
    return mockUserDb.isTaken(username);
  }

  async logout(): Promise<void> {
    await delay(150);
    await secureStorage.removeItem(StorageKeys.accessToken);
    await secureStorage.removeItem(StorageKeys.refreshToken);
    await secureStorage.removeItem(StorageKeys.mockUser);
  }

  async restore(): Promise<User | null> {
    const token = await secureStorage.getItem(StorageKeys.accessToken);
    if (!token) return null;
    await delay(200);
    const saved = await secureStorage.getItem(StorageKeys.mockUser);
    if (saved) {
      try {
        const u = JSON.parse(saved) as User;
        return { ...u, createdAt: new Date(u.createdAt) };
      } catch {
        // 파싱 실패 시 아래로 폴백
      }
    }
    return null;
  }
}
