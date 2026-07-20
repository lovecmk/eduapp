import type { User } from '../models/User';

export interface AuthSession {
  user: User;
  accessToken: string;
  refreshToken: string;
}

/** 회원가입 입력 */
export interface SignupInput {
  /** 로그인 아이디 */
  username: string;
  password: string;
  name: string;
  email: string;
  org?: string;
}

export interface IAuthRepository {
  login(id: string, password: string): Promise<AuthSession>;
  logout(): Promise<void>;
  /** 저장된 토큰으로 세션 복구 (스플래시/생체인증 후) */
  restore(): Promise<User | null>;
  /** 신규 회원가입 후 바로 로그인된 세션을 반환 */
  register(input: SignupInput): Promise<AuthSession>;
  /** 아이디+이메일이 일치하는 계정의 비밀번호를 재설정 */
  resetPassword(username: string, email: string, newPassword: string): Promise<void>;
  /** 아이디 중복 여부(회원가입 실시간 검증용) */
  isUsernameTaken(username: string): Promise<boolean>;
}
