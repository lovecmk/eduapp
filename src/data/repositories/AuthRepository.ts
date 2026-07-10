import type { IAuthRepository, AuthSession } from '../../domain/repositories/IAuthRepository';
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
