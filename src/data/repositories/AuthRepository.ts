import type { IAuthRepository, AuthSession, SignupInput, ProfileUpdateInput, EmailCodeRequestResult } from '../../domain/repositories/IAuthRepository';
import type { User } from '../../domain/models/User';
import type { AuthResultDTO, UserDTO } from '../dto/UserDTO';
import { UserMapper } from '../mappers/UserMapper';
import { apiClient } from '../network/ApiClient';
import { secureStorage, StorageKeys } from '../storage/secureStorage';
import { toApiError } from '../network/errors';
import { logger } from '../../utils/logger';

export class AuthRepository implements IAuthRepository {
  /** 로그인 성공 결과(토큰 + 프로필 캐시)를 저장하고 세션으로 만든다. */
  private async persistSession(dto: AuthResultDTO): Promise<AuthSession> {
    const user = UserMapper.toDomain(dto.user);
    await secureStorage.setItem(StorageKeys.accessToken, dto.access_token);
    await secureStorage.setItem(StorageKeys.refreshToken, dto.refresh_token);
    await this.cacheUser(dto.user);
    return { user, accessToken: dto.access_token, refreshToken: dto.refresh_token };
  }

  /**
   * 마지막으로 서버가 확인해 준 프로필을 저장해 둔다.
   * 이 앱은 지하·철골 구조물 안에서 쓰인다 — 연결이 없는 채로 앱을 켜는 일이 흔하다.
   * 캐시가 없으면 그때마다 로그인 화면으로 튕겨, 토큰이 멀쩡한데도 다시 로그인해야 한다.
   */
  private async cacheUser(dto: UserDTO): Promise<void> {
    try {
      await secureStorage.setItem(StorageKeys.cachedUser, JSON.stringify(dto));
    } catch {
      // 캐시는 편의 기능이다 — 저장에 실패해도 로그인 자체를 실패시키지 않는다.
    }
  }

  /** 저장해 둔 프로필을 읽는다. 없거나 깨졌으면 null. */
  private async readCachedUser(): Promise<User | null> {
    const raw = await secureStorage.getItem(StorageKeys.cachedUser);
    if (!raw) return null;
    try {
      return UserMapper.toDomain(JSON.parse(raw) as UserDTO);
    } catch {
      return null;
    }
  }

  async login(id: string, password: string): Promise<AuthSession> {
    return this.persistSession(
      await apiClient.post<AuthResultDTO>('/api/auth/login', { id, password }),
    );
  }

  async socialLogin(name: string, email: string): Promise<AuthSession> {
    return this.persistSession(
      await apiClient.post<AuthResultDTO>('/api/auth/social', { name, email }),
    );
  }

  async register(input: SignupInput): Promise<AuthSession> {
    return this.persistSession(
      await apiClient.post<AuthResultDTO>('/api/auth/register', input),
    );
  }

  async resetPassword(username: string, email: string, newPassword: string): Promise<void> {
    await apiClient.post('/api/auth/reset-password', { username, email, newPassword });
  }

  /**
   * 인증코드 발송 — 코드는 서버가 생성해 메일로만 보낸다.
   * 응답에 코드를 포함시키지 않는 것이 계약이다(포함되면 우회 가능).
   */
  async requestEmailCode(email: string): Promise<EmailCodeRequestResult> {
    await apiClient.post('/api/auth/email/request-code', { email });
    return {};
  }

  /** 인증코드 검증 — 비교는 서버에서만 수행한다. */
  async verifyEmailCode(email: string, code: string): Promise<boolean> {
    const dto = await apiClient.post<{ verified: boolean }>('/api/auth/email/verify-code', { email, code });
    return dto.verified === true;
  }

  async isUsernameTaken(username: string): Promise<boolean> {
    const dto = await apiClient.get<{ taken: boolean }>(`/api/auth/username-available?username=${encodeURIComponent(username)}`);
    return dto.taken;
  }

  async isNicknameTaken(nickname: string, excludeUserId?: string): Promise<boolean> {
    const q = excludeUserId ? `&exclude=${encodeURIComponent(excludeUserId)}` : '';
    const dto = await apiClient.get<{ taken: boolean }>(`/api/auth/nickname-available?nickname=${encodeURIComponent(nickname)}${q}`);
    return dto.taken;
  }

  async updateProfile(userId: string, patch: ProfileUpdateInput): Promise<User> {
    const dto = await apiClient.patch<UserDTO>('/api/auth/me', patch);
    await this.cacheUser(dto); // 캐시가 옛 이름을 들고 있으면 오프라인 복구 때 되돌아간 것처럼 보인다
    return UserMapper.toDomain(dto);
  }

  /** 로컬에 남은 세션 흔적(토큰 + 프로필 캐시)을 지운다. */
  private async clearSession(): Promise<void> {
    await secureStorage.removeItem(StorageKeys.accessToken);
    await secureStorage.removeItem(StorageKeys.refreshToken);
    await secureStorage.removeItem(StorageKeys.cachedUser);
  }

  async logout(): Promise<void> {
    try {
      await apiClient.post('/api/auth/logout', {});
    } finally {
      await this.clearSession();
    }
  }

  /**
   * 앱 부팅 시 세션 복구. 스플래시가 이 결과를 기다리므로 재시도 없이 한 번만
   * 물어본다(기본 재시도 정책이면 오프라인일 때 30초 넘게 화면이 멈춘다).
   * 서버에 닿지 못한 것과 서버가 거절한 것은 구분한다 — 앞은 캐시로 세션을 잇고,
   * 뒤는 정직하게 로그아웃한다.
   */
  async restore(): Promise<User | null> {
    const token = await secureStorage.getItem(StorageKeys.accessToken);
    if (!token) return null;
    try {
      const dto = await apiClient.get<UserDTO>('/api/auth/me', { retries: 0 });
      await this.cacheUser(dto);
      return UserMapper.toDomain(dto);
    } catch (e) {
      const err = toApiError(e);
      // 서버가 거절한 세션(만료·정지)은 캐시로 되살리지 않는다 —
      // 그러면 정지된 사용자가 오프라인에서 계속 앱을 쓰게 된다.
      if (err.kind === 'unauthorized' || err.kind === 'forbidden') {
        // 이 토큰으로는 다시 시도해도 소용없다. 남겨 두면 앱을 켤 때마다
        // 실패 요청을 한 번씩 더 보내고, 캐시된 프로필도 계속 남는다.
        await this.clearSession();
        throw err;
      }
      if (!err.retryable) throw err;
      const cached = await this.readCachedUser();
      if (!cached) throw err;
      logger.info('session_restored_from_cache', { reason: err.kind });
      return cached;
    }
  }
}
