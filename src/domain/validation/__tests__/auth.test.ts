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

/**
 * 아이디는 사내 이메일이다.
 *
 * 로그인 화면이 아이디의 예시로 `bridge@kfpa.or.kr` 을 보여 주는데 회원가입이
 * 그 모양을 거부하면, 안내대로 입력한 사람이 가입에 실패한다 — 한 앱 안에서
 * 두 화면이 서로 다른 말을 하던 자리다.
 */
describe('validateUsername', () => {
  it.each(['bridge@kfpa.or.kr', 'hong.gildong@kfpa.or.kr', 'user_01@example.com'])(
    '사내 이메일 형식(%s)은 통과',
    (v) => {
      expect(validateUsername(v)).toBeNull();
    },
  );
  it('로그인 화면이 안내하는 예시가 실제로 통과한다', () => {
    expect(validateUsername('bridge@kfpa.or.kr')).toBeNull();
  });
  it('빈 값은 필수 메시지', () => {
    expect(validateUsername('   ')).toBe(AUTH_MESSAGES.usernameRequired);
  });
  it.each(['abc', '홍길동', 'user_01', 'a@b', 'bad space@x.com', 'a@@b.com'])(
    '이메일이 아닌 값(%s)은 형식 메시지',
    (v) => {
      expect(validateUsername(v)).toBe(AUTH_MESSAGES.usernameFormat);
    },
  );
  it('앞뒤 공백은 다듬어서 본다', () => {
    expect(validateUsername('  bridge@kfpa.or.kr  ')).toBeNull();
  });
  it(`${AUTH_RULES.username.max}자를 넘으면 길이 메시지`, () => {
    const long = `${'a'.repeat(AUTH_RULES.username.max)}@kfpa.or.kr`;
    expect(validateUsername(long)).toBe(AUTH_MESSAGES.usernameTooLong);
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
