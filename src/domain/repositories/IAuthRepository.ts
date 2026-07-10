import type { User } from '../models/User';

export interface AuthSession {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface IAuthRepository {
  login(id: string, password: string): Promise<AuthSession>;
  logout(): Promise<void>;
  /** 저장된 토큰으로 세션 복구 (스플래시/생체인증 후) */
  restore(): Promise<User | null>;
}
