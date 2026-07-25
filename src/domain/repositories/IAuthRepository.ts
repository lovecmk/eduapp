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
  /** 공개 닉네임 */
  nickname: string;
  email: string;
  org?: string;
}

/** 내 정보 수정 입력 — 넘긴 필드만 갱신(부분 업데이트). */
export interface ProfileUpdateInput {
  name?: string;
  nickname?: string;
  email?: string;
  org?: string;
  jobTitle?: string;
}

/** 이메일 인증코드 발송 결과. */
export interface EmailCodeRequestResult {
  /**
   * 목업(데모) 모드에서만 채워지는 화면 표시용 코드.
   * 실서버 모드에서는 **절대 채우지 않는다** — 코드는 메일로만 전달되고 검증도 서버가 한다.
   */
  devPreviewCode?: string;
}

export interface IAuthRepository {
  login(id: string, password: string): Promise<AuthSession>;
  /** 이메일 인증코드 발송 요청. 코드 생성·보관은 저장소(실서버) 책임. */
  requestEmailCode(email: string): Promise<EmailCodeRequestResult>;
  /** 이메일 인증코드 검증. 일치 여부만 반환하며, 비교는 저장소(실서버)에서 수행한다. */
  verifyEmailCode(email: string, code: string): Promise<boolean>;
  /** 소셜 간편 로그인(데모) — 지정한 이름/이메일 계정으로 로그인(없으면 생성). */
  socialLogin(name: string, email: string): Promise<AuthSession>;
  logout(): Promise<void>;
  /** 저장된 토큰으로 세션 복구 (스플래시/생체인증 후) */
  restore(): Promise<User | null>;
  /** 신규 회원가입 후 바로 로그인된 세션을 반환 */
  register(input: SignupInput): Promise<AuthSession>;
  /** 아이디+이메일이 일치하는 계정의 비밀번호를 재설정 */
  resetPassword(username: string, email: string, newPassword: string): Promise<void>;
  /** 아이디 중복 여부(회원가입 실시간 검증용) */
  isUsernameTaken(username: string): Promise<boolean>;
  /** 닉네임 중복 여부(회원가입·내 정보 수정 실시간 검증용).
   *  excludeUserId 를 넘기면 그 사용자 본인의 현재 닉네임은 중복으로 보지 않는다. */
  isNicknameTaken(nickname: string, excludeUserId?: string): Promise<boolean>;
  /** 현재 로그인한 사용자의 프로필을 부분 갱신하고 최신 User 를 반환. */
  updateProfile(userId: string, patch: ProfileUpdateInput): Promise<User>;
}
