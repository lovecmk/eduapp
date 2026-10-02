import { ApiError } from './errors';

// 비동기 작업이 시작한 로그인 세션에서만 완료되게 한다. 같은 계정의 재로그인도 구분한다.
let epoch = 0;

export function getSessionEpoch(): number {
  return epoch;
}

export function advanceSessionEpoch(): number {
  return ++epoch;
}

export function assertSessionEpoch(expected: number): void {
  if (expected !== epoch) throw new ApiError(0, '계정이 변경되어 요청을 취소했어요.', 'cancelled');
}
