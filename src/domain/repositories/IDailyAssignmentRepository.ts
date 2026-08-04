import type { DailyAssignment } from '../models/DailyAssignment';

/**
 * 오늘의 학습 조회 계약.
 *
 * 조회 하나뿐인 것이 의도적이다 — 앱이 "오늘 이 문제를 내 달라"고 요청할 수
 * 있으면 그 순간 출제 정책이 클라이언트로 넘어간다. 무엇을 낼지는 서버가 정하고,
 * 앱은 받은 것을 보여 주기만 한다.
 */
export interface IDailyAssignmentRepository {
  get(): Promise<DailyAssignment>;
}
