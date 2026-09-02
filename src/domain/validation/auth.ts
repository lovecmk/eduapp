// 인증 입력 검증 규칙 — 단일 소스(Single Source of Truth).
//
// 왜 여기 모으나: 규칙이 화면마다 하드코딩되어 있으면(회원가입 4자, 비번찾기 4자, …)
// 한 곳만 고쳐도 다른 화면과 어긋나고, 백엔드 검증과도 조용히 벌어진다.
// 프론트는 이 파일만 사용하고, 백엔드도 **같은 규칙**을 서버 측에서 다시 검증해야 한다
// (클라이언트 검증은 UX용일 뿐, 신뢰 경계는 항상 서버다).
//
// ⚠️ 백엔드 계약: 아래 RULES 를 서버 DTO/Validator 에 그대로 옮겨 구현할 것.
//    불일치 시 "프론트는 통과했는데 서버가 400" 같은 사용자 혼란이 발생한다.

export const AUTH_RULES = {
  /**
   * 아이디 = **사내 이메일**.
   *
   * 로그인 화면은 아이디의 예시로 `bridge@kfpa.or.kr` 을 보여 주는데, 회원가입의
   * 검증은 한글/영문/숫자만 받아 그 모양을 거부하고 있었다. 한 앱 안에서 한 화면은
   * 이메일을 예시로 들고 다른 화면은 그것을 틀렸다고 말한 셈이라, 안내대로 입력한
   * 사람이 가입에 실패했다.
   *
   * 도메인까지 여기서 못 박지는 않는다. 사내 도메인이 하나라는 보장이 없고, 틀리게
   * 박아 두면 멀쩡한 직원이 가입 자체를 못 한다 — 클라이언트 검증은 UX 이고 어느
   * 계정을 받을지는 서버가 정한다(이 파일 맨 위 주석의 신뢰 경계).
   */
  username: { max: 254, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  nickname: { min: 2, max: 12, pattern: /^[a-zA-Z0-9가-힣_]{2,12}$/ },
  /** RFC 전체 문법 대신 실무용 최소 형식 검사 + 길이 상한(RFC 5321). */
  email: { max: 254, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  /**
   * 비밀번호: 최소 8자 + 영문/숫자 각 1자 이상.
   * (기존 4자 규칙은 무차별 대입에 지나치게 취약해 상향했다. 로그인은 길이를 검사하지
   *  않으므로 기존 계정의 로그인에는 영향이 없고, 신규 가입·비밀번호 재설정에만 적용된다.)
   */
  password: { min: 8, max: 72 },
  name: { min: 1, max: 30 },
} as const;

export const AUTH_MESSAGES = {
  usernameRequired: '아이디를 입력해주세요',
  usernameFormat: '아이디는 사내 이메일 형식으로 입력하세요 (예: bridge@kfpa.or.kr)',
  usernameTooLong: `아이디는 ${AUTH_RULES.username.max}자 이하로 입력하세요`,
  nicknameRequired: '닉네임을 입력해주세요',
  nicknameFormat: `닉네임은 ${AUTH_RULES.nickname.min}~${AUTH_RULES.nickname.max}자(한글/영문/숫자)로 입력하세요`,
  emailFormat: '올바른 이메일 형식이 아닙니다',
  emailTooLong: '이메일이 너무 깁니다',
  passwordTooShort: `비밀번호는 ${AUTH_RULES.password.min}자 이상이어야 합니다`,
  passwordTooLong: `비밀번호는 ${AUTH_RULES.password.max}자 이하로 입력하세요`,
  passwordWeak: '비밀번호에 영문과 숫자를 모두 포함해주세요',
  passwordMismatch: '비밀번호가 일치하지 않습니다',
  nameRequired: '이름을 입력해주세요',
  nameTooLong: `이름은 ${AUTH_RULES.name.max}자 이하로 입력하세요`,
} as const;

/** 검증 결과 — 통과 시 null, 실패 시 사용자에게 보여줄 메시지. */
export type ValidationResult = string | null;

export function validateUsername(v: string): ValidationResult {
  const s = v.trim();
  if (!s) return AUTH_MESSAGES.usernameRequired;
  if (s.length > AUTH_RULES.username.max) return AUTH_MESSAGES.usernameTooLong;
  return AUTH_RULES.username.pattern.test(s) ? null : AUTH_MESSAGES.usernameFormat;
}

export function validateNickname(v: string): ValidationResult {
  const s = v.trim();
  if (!s) return AUTH_MESSAGES.nicknameRequired;
  return AUTH_RULES.nickname.pattern.test(s) ? null : AUTH_MESSAGES.nicknameFormat;
}

export function validateEmail(v: string): ValidationResult {
  const s = v.trim();
  if (s.length > AUTH_RULES.email.max) return AUTH_MESSAGES.emailTooLong;
  return AUTH_RULES.email.pattern.test(s) ? null : AUTH_MESSAGES.emailFormat;
}

export function validateName(v: string): ValidationResult {
  const s = v.trim();
  if (!s) return AUTH_MESSAGES.nameRequired;
  return s.length <= AUTH_RULES.name.max ? null : AUTH_MESSAGES.nameTooLong;
}

/** 비밀번호 자체 규칙(길이·구성). 공백은 의도적으로 허용(패스프레이즈). */
export function validatePassword(v: string): ValidationResult {
  if (v.length < AUTH_RULES.password.min) return AUTH_MESSAGES.passwordTooShort;
  if (v.length > AUTH_RULES.password.max) return AUTH_MESSAGES.passwordTooLong;
  const hasLetter = /[a-zA-Z]/.test(v);
  const hasDigit = /[0-9]/.test(v);
  return hasLetter && hasDigit ? null : AUTH_MESSAGES.passwordWeak;
}

/** 비밀번호 확인 일치 검사. */
export function validatePasswordConfirm(pw: string, pw2: string): ValidationResult {
  return pw === pw2 ? null : AUTH_MESSAGES.passwordMismatch;
}

/** 입력 안내용 placeholder — 규칙이 바뀌면 화면 문구도 자동으로 따라간다. */
export const PASSWORD_PLACEHOLDER = `${AUTH_RULES.password.min}자 이상, 영문+숫자 포함`;
