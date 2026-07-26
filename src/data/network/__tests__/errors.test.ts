import { ApiError, kindOf, toApiError, errorMessage } from '../errors';

describe('kindOf — HTTP 상태 → 오류 종류', () => {
  it.each([
    [0, 'offline'],
    [400, 'invalid'],
    [422, 'invalid'],
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'notFound'],
    [409, 'conflict'],
    [429, 'rateLimited'],
    [500, 'server'],
    [503, 'server'],
    [418, 'unknown'],
  ] as const)('%i → %s', (status, kind) => {
    expect(kindOf(status)).toBe(kind);
  });
});

describe('ApiError', () => {
  it('서버가 준 문구를 사용자 문구로 그대로 쓴다', () => {
    expect(new ApiError(409, '이미 사용 중인 아이디입니다').userMessage).toBe('이미 사용 중인 아이디입니다');
  });

  it('서버 문구가 없으면 종류별 기본 안내로 대체한다', () => {
    expect(new ApiError(500, '').userMessage).toContain('서버');
    expect(new ApiError(0, '').userMessage).toContain('네트워크');
    expect(new ApiError(401, '   ').userMessage).toContain('로그인');
  });

  it('일시적 실패만 재시도 대상으로 본다', () => {
    expect(new ApiError(0, '').retryable).toBe(true);   // 연결 없음
    expect(new ApiError(500, '').retryable).toBe(true); // 서버 오류
    expect(new ApiError(429, '').retryable).toBe(true); // 과부하
    expect(new ApiError(400, '').retryable).toBe(false);
    expect(new ApiError(401, '').retryable).toBe(false);
    expect(new ApiError(404, '').retryable).toBe(false);
  });

  it('instanceof 가 유지된다(프로토타입 복원)', () => {
    expect(new ApiError(500, 'x')).toBeInstanceOf(ApiError);
    expect(new ApiError(500, 'x')).toBeInstanceOf(Error);
  });
});

describe('toApiError / errorMessage', () => {
  it('ApiError 는 그대로 통과', () => {
    const e = new ApiError(404, 'x');
    expect(toApiError(e)).toBe(e);
  });
  it('일반 Error 는 unknown 으로 감싼다', () => {
    const e = toApiError(new Error('boom'));
    expect(e).toBeInstanceOf(ApiError);
    expect(e.kind).toBe('unknown');
  });
  it('Error 가 아닌 값도 안전하게 처리한다', () => {
    expect(toApiError('문자열').kind).toBe('unknown');
    expect(toApiError(null).userMessage).toBeTruthy();
  });
  it('errorMessage 는 어떤 값이든 사용자 문구를 만든다', () => {
    expect(errorMessage(new ApiError(0, ''))).toContain('네트워크');
    expect(errorMessage(undefined)).toBeTruthy();
  });
});
