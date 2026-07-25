import {
  AUTH_RULES,
  AUTH_MESSAGES,
  validateUsername,
  validateNickname,
  validateEmail,
  validateName,
  validatePassword,
  validatePasswordConfirm,
} from '../auth';

describe('validateUsername', () => {
  it.each(['abc', '홍길동', 'user_01', 'a1'])('유효한 아이디(%s)는 통과', (v) => {
    expect(validateUsername(v)).toBeNull();
  });
  it('빈 값은 필수 메시지', () => {
    expect(validateUsername('   ')).toBe(AUTH_MESSAGES.usernameRequired);
  });
  it.each(['a', 'a'.repeat(21), 'bad space', 'bad!@#'])('형식 위반(%s)은 형식 메시지', (v) => {
    expect(validateUsername(v)).toBe(AUTH_MESSAGES.usernameFormat);
  });
  it('경계값: 2자 통과 / 20자 통과 / 21자 실패', () => {
    expect(validateUsername('a'.repeat(AUTH_RULES.username.min))).toBeNull();
    expect(validateUsername('a'.repeat(AUTH_RULES.username.max))).toBeNull();
    expect(validateUsername('a'.repeat(AUTH_RULES.username.max + 1))).not.toBeNull();
  });
});

describe('validateNickname', () => {
  it('유효한 닉네임 통과', () => {
    expect(validateNickname('현장왕')).toBeNull();
  });
  it('경계값: 12자 통과 / 13자 실패', () => {
    expect(validateNickname('a'.repeat(AUTH_RULES.nickname.max))).toBeNull();
    expect(validateNickname('a'.repeat(AUTH_RULES.nickname.max + 1))).not.toBeNull();
  });
  it('빈 값은 필수 메시지', () => {
    expect(validateNickname('')).toBe(AUTH_MESSAGES.nicknameRequired);
  });
});

describe('validateEmail', () => {
  it.each(['a@b.co', 'won@example.com', '가@나.한국'])('유효한 이메일(%s)은 통과', (v) => {
    expect(validateEmail(v)).toBeNull();
  });
  it.each(['', 'no-at', 'a@b', 'a b@c.com', '@b.co'])('잘못된 형식(%s)은 형식 메시지', (v) => {
    expect(validateEmail(v)).toBe(AUTH_MESSAGES.emailFormat);
  });
  it('254자 초과는 길이 메시지', () => {
    expect(validateEmail('a'.repeat(250) + '@b.co')).toBe(AUTH_MESSAGES.emailTooLong);
  });
});

describe('validateName', () => {
  it('정상 이름 통과', () => expect(validateName('원진섭')).toBeNull());
  it('공백만 있으면 필수 메시지', () => expect(validateName('  ')).toBe(AUTH_MESSAGES.nameRequired));
  it('30자 초과는 길이 메시지', () => {
    expect(validateName('가'.repeat(31))).toBe(AUTH_MESSAGES.nameTooLong);
  });
});

describe('validatePassword (보안 강화 규칙)', () => {
  it('8자 이상 + 영문/숫자 포함이면 통과', () => {
    expect(validatePassword('safe1234')).toBeNull();
    expect(validatePassword('Abcd1234!')).toBeNull();
  });
  it('8자 미만은 길이 메시지 (기존 4자 규칙 차단)', () => {
    expect(validatePassword('ab12')).toBe(AUTH_MESSAGES.passwordTooShort);
    expect(validatePassword('1234')).toBe(AUTH_MESSAGES.passwordTooShort);
  });
  it('숫자 없음/영문 없음은 구성 메시지', () => {
    expect(validatePassword('abcdefgh')).toBe(AUTH_MESSAGES.passwordWeak);
    expect(validatePassword('12345678')).toBe(AUTH_MESSAGES.passwordWeak);
  });
  it('72자 초과는 길이 상한 메시지', () => {
    expect(validatePassword('a1'.repeat(40))).toBe(AUTH_MESSAGES.passwordTooLong);
  });
  it('경계값: 정확히 8자 통과', () => {
    expect(validatePassword('abcdefg1')).toBeNull();
  });
});

describe('validatePasswordConfirm', () => {
  it('일치하면 통과', () => expect(validatePasswordConfirm('safe1234', 'safe1234')).toBeNull());
  it('불일치하면 메시지', () => {
    expect(validatePasswordConfirm('safe1234', 'safe12345')).toBe(AUTH_MESSAGES.passwordMismatch);
  });
});
