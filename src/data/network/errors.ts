/**
 * 네트워크 오류의 단일 표현.
 *
 * 화면은 status 숫자를 직접 해석하지 않고 `kind` 와 `userMessage` 만 보면 되도록 한다.
 * (화면마다 `if (status === 401)` 같은 분기가 흩어지면 문구·동작이 제각각이 된다.)
 */
export type ApiErrorKind =
  /** 인터넷 연결 없음·타임아웃 등 서버에 닿지 못한 경우(status 0) */
  | 'offline'
  /** 입력값 문제(400/422) — 사용자가 고칠 수 있다 */
  | 'invalid'
  /** 로그인 만료·실패(401) */
  | 'unauthorized'
  /** 권한 없음(403) */
  | 'forbidden'
  /** 대상 없음(404) */
  | 'notFound'
  /** 중복(409) — 아이디·닉네임 등 */
  | 'conflict'
  /** 요청이 너무 잦음(429) */
  | 'rateLimited'
  /** 서버 오류(5xx) */
  | 'server'
  /** 그 외 */
  | 'unknown';

export function kindOf(status: number): ApiErrorKind {
  if (status === 0) return 'offline';
  if (status === 400 || status === 422) return 'invalid';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'notFound';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rateLimited';
  if (status >= 500) return 'server';
  return 'unknown';
}

/** 종류별 기본 안내 문구 — 서버가 message 를 주지 않을 때 사용한다. */
const DEFAULT_MESSAGE: Record<ApiErrorKind, string> = {
  offline: '네트워크에 연결할 수 없어요. 연결 상태를 확인해주세요.',
  invalid: '입력한 내용을 다시 확인해주세요.',
  unauthorized: '로그인이 만료되었어요. 다시 로그인해주세요.',
  forbidden: '이 작업을 수행할 권한이 없어요.',
  notFound: '요청한 정보를 찾을 수 없어요.',
  conflict: '이미 처리된 요청이에요.',
  rateLimited: '요청이 너무 잦아요. 잠시 후 다시 시도해주세요.',
  server: '서버에 문제가 생겼어요. 잠시 후 다시 시도해주세요.',
  unknown: '알 수 없는 오류가 발생했어요.',
};

export class ApiError extends Error {
  readonly kind: ApiErrorKind;

  constructor(
    public status: number,
    message: string,
    kind?: ApiErrorKind,
  ) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind ?? kindOf(status);
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  /** 화면에 그대로 보여줄 수 있는 문구. 서버 문구가 있으면 그것을 우선한다. */
  get userMessage(): string {
    return this.message?.trim() || DEFAULT_MESSAGE[this.kind];
  }

  /**
   * 같은 요청을 그대로 다시 보내볼 만한 실패인지.
   * 네트워크 문제·서버 일시 오류·과부하는 재시도 가치가 있고,
   * 입력 오류·권한 문제는 몇 번을 보내도 같은 결과라 재시도하지 않는다.
   */
  get retryable(): boolean {
    return this.kind === 'offline' || this.kind === 'server' || this.kind === 'rateLimited';
  }
}

/** 임의의 예외를 ApiError 로 정규화한다(호출부에서 타입 분기를 단순화). */
export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof Error) return new ApiError(0, e.message, 'unknown');
  return new ApiError(0, '알 수 없는 오류가 발생했어요.', 'unknown');
}

/** 화면에서 쓰는 헬퍼 — 어떤 예외든 사용자용 문구로 바꾼다. */
export function errorMessage(e: unknown): string {
  return toApiError(e).userMessage;
}
