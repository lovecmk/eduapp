import type { IAuthRepository, AuthSession, SignupInput, ProfileUpdateInput } from '../../domain/repositories/IAuthRepository';
import type { User } from '../../domain/models/User';
import type { AuthResultDTO, UserDTO } from '../dto/UserDTO';
import { UserMapper } from '../mappers/UserMapper';
import { apiClient } from '../network/ApiClient';
import { secureStorage, StorageKeys } from '../storage/secureStorage';

export class AuthRepository implements IAuthRepository {
  async login(id: string, password: string): Promise<AuthSession> {
    const dto = await apiClient.post<AuthResultDTO>('/api/auth/login', { id, password });
    await secureStorage.setItem(StorageKeys.accessToken, dto.access_token);
    await secureStorage.setItem(StorageKeys.refreshToken, dto.refresh_token);
    return {
      user: UserMapper.toDomain(dto.user),
      accessToken: dto.access_token,
      refreshToken: dto.refresh_token,
    };
  }

  async socialLogin(name: string, email: string): Promise<AuthSession> {
    const dto = await apiClient.post<AuthResultDTO>('/api/auth/social', { name, email });
    await secureStorage.setItem(StorageKeys.accessToken, dto.access_token);
    await secureStorage.setItem(StorageKeys.refreshToken, dto.refresh_token);
    return {
      user: UserMapper.toDomain(dto.user),
      accessToken: dto.access_token,
      refreshToken: dto.refresh_token,
    };
  }

  async register(input: SignupInput): Promise<AuthSession> {
    const dto = await apiClient.post<AuthResultDTO>('/api/auth/register', input);
    await secureStorage.setItem(StorageKeys.accessToken, dto.access_token);
    await secureStorage.setItem(StorageKeys.refreshToken, dto.refresh_token);
    return {
      user: UserMapper.toDomain(dto.user),
      accessToken: dto.access_token,
      refreshToken: dto.refresh_token,
    };
  }

  async resetPassword(username: string, email: string, newPassword: string): Promise<void> {
    await apiClient.post('/api/auth/reset-password', { username, email, newPassword });
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
    return UserMapper.toDomain(dto);
  }

  async logout(): Promise<void> {
    try {
      await apiClient.post('/api/auth/logout', {});
    } finally {
      await secureStorage.removeItem(StorageKeys.accessToken);
      await secureStorage.removeItem(StorageKeys.refreshToken);
    }
  }

  async restore(): Promise<User | null> {
    const token = await secureStorage.getItem(StorageKeys.accessToken);
    if (!token) return null;
    const dto = await apiClient.get<UserDTO>('/api/auth/me');
    return UserMapper.toDomain(dto);
  }
}
