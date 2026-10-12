import type { IAuthRepository, AuthSession, SignupInput, ProfileUpdateInput, EmailCodeRequestResult } from '../../domain/repositories/IAuthRepository';
import type { User } from '../../domain/models/User';
import type { AuthResultDTO, UserDTO } from '../dto/UserDTO';
import { UserMapper } from '../mappers/UserMapper';
import { apiClient } from '../network/ApiClient';
import { secureStorage, StorageKeys } from '../storage/secureStorage';
import { ApiError, toApiError } from '../network/errors';
import { logger } from '../../utils/logger';
import { getSessionEpoch, assertSessionEpoch } from '../network/sessionEpoch';

export class AuthRepository implements IAuthRepository {
  /** 로그인 성공 결과(토큰 + 프로필 캐시)를 저장하고 세션으로 만든다. */
  private async persistSession(dto: AuthResultDTO, epoch: number): Promise<AuthSession> {
    assertSessionEpoch(epoch);
    if (!dto?.user || typeof dto.access_token !== 'string' || !dto.access_token || typeof dto.refresh_token !== 'string' || !dto.refresh_token) {
      throw new ApiError(502, '로그인 응답이 올바르지 않아요. 잠시 후 다시 시도해주세요.', 'server');
    }
    const user = UserMapper.toDomain(dto.user);
    await secureStorage.setItem(StorageKeys.accessToken, dto.access_token);
    assertSessionEpoch(epoch);
    await secureStorage.setItem(StorageKeys.refreshToken, dto.refresh_token);
    assertSessionEpoch(epoch);
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
    const epoch = getSessionEpoch();
    return this.persistSession(
      await apiClient.post<AuthResultDTO>('/inner/api/v1/auth/login', { id, password }),
      epoch,
    );
  }

  /**
   * 간편 로그인 — **실서버에는 없다.**
   *
   * 목업의 간편 로그인은 이름·이메일만으로 계정을 찾아 세션을 내주는 데모다.
   * 그 계약을 서버에 그대로 옮기면 아무나 `{name, email}` 을 보내 남의 계정
   * 토큰을 받아 갈 수 있다 — 비밀번호를 묻지 않는 인증이 되어 버린다.
   * 그래서 서버에는 이 라우트가 없고, 앞으로도 진짜 OAuth(제공자가 서명한
   * 토큰을 서버가 검증하는 방식) 없이는 열지 않는다.
   *
   * 없는 경로를 그냥 호출하면 사용자에게는 "요청한 정보를 찾을 수 없어요"(404)가
   * 뜬다 — 무엇이 잘못됐는지 알 수 없는 문구다. 여기서 정직하게 끊는다.
   */
  async socialLogin(_name: string, _email: string): Promise<AuthSession> {
    throw new ApiError(
      501,
      '간편 로그인은 아직 준비 중이에요. 아이디와 비밀번호로 로그인해주세요.',
      'unknown',
    );
  }

  async register(input: SignupInput): Promise<AuthSession> {
    const epoch = getSessionEpoch();
    return this.persistSession(
      await apiClient.post<AuthResultDTO>('/inner/api/v1/auth/register', input),
      epoch,
    );
  }

  /**
   * 비밀번호 재설정 — **실서버에는 없다.**
   *
   * 목업은 아이디와 이메일이 맞으면 곧바로 비밀번호를 바꿔 준다. 서버에 그대로
   * 옮기면 남의 아이디와 이메일만 알면 그 계정을 가져갈 수 있다 — 둘 다 비밀이
   * 아니다(이메일은 명함에 적혀 있고 아이디는 화면에 보인다).
   *
   * 제대로 하려면 아래 `requestEmailCode` 가 실제로 메일을 보내고 그 코드를
   * 검증한 세션에서만 재설정을 허용해야 하는데, 지금 배포에는 메일 발송 경로가
   * 없다. 없는 것을 있는 척하는 대신 여기서 정직하게 끊는다.
   */
  async resetPassword(_username: string, _email: string, _newPassword: string): Promise<void> {
    throw new ApiError(
      501,
      '비밀번호 재설정은 아직 준비 중이에요. 관리자에게 문의해주세요.',
      'unknown',
    );
  }

  /**
   * 인증코드 발송 — 코드는 서버가 생성해 메일로만 보낸다.
   * 응답에 코드를 포함시키지 않는 것이 계약이다(포함되면 우회 가능).
   *
   * 지금 배포에는 메일 발송 경로가 없어 서버에 이 라우트가 없다.
   */
  async requestEmailCode(_email: string): Promise<EmailCodeRequestResult> {
    throw new ApiError(
      501,
      '이메일 인증은 아직 준비 중이에요. 관리자에게 문의해주세요.',
      'unknown',
    );
  }

  /** 인증코드 검증 — 비교는 서버에서만 수행한다(위와 같은 이유로 미구현). */
  async verifyEmailCode(_email: string, _code: string): Promise<boolean> {
    throw new ApiError(
      501,
      '이메일 인증은 아직 준비 중이에요. 관리자에게 문의해주세요.',
      'unknown',
    );
  }

  async isUsernameTaken(username: string): Promise<boolean> {
    const dto = await apiClient.get<{ taken: boolean }>(`/inner/api/v1/auth/username-available?username=${encodeURIComponent(username)}`);
    return dto.taken;
  }

  async isNicknameTaken(nickname: string, excludeUserId?: string): Promise<boolean> {
    const q = excludeUserId ? `&exclude=${encodeURIComponent(excludeUserId)}` : '';
    const dto = await apiClient.get<{ taken: boolean }>(`/inner/api/v1/auth/nickname-available?nickname=${encodeURIComponent(nickname)}${q}`);
    return dto.taken;
  }

  async updateProfile(userId: string, patch: ProfileUpdateInput): Promise<User> {
    const epoch = getSessionEpoch();
    const dto = await apiClient.post<UserDTO>('/inner/api/v1/auth/me/edit', patch);
    assertSessionEpoch(epoch);
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
      await apiClient.post('/inner/api/v1/auth/logout', {});
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
    const epoch = getSessionEpoch();
    const token = await secureStorage.getItem(StorageKeys.accessToken);
    assertSessionEpoch(epoch);
    if (!token) return null;
    try {
      const dto = await apiClient.get<UserDTO>('/inner/api/v1/auth/me', { retries: 0 });
      assertSessionEpoch(epoch);
      await this.cacheUser(dto);
      return UserMapper.toDomain(dto);
    } catch (e) {
      assertSessionEpoch(epoch);
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
      assertSessionEpoch(epoch);
      if (!cached) throw err;
      logger.info('session_restored_from_cache', { reason: err.kind });
      return cached;
    }
  }
}
