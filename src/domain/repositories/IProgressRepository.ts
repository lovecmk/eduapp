import type { Grade, SrsCardState } from '../srs';

/**
 * 학습 진행 동기화 — 이 앱에서 가장 중요한 사용자 데이터.
 *
 * 지금까지 SRS 상태(복습 일정)·학습 이력·출석 도장은 기기 로컬에만 있었다.
 * 기기를 바꾸거나 앱을 지우면 몇 달치 학습 기록이 사라지고, 카드팩 획득 조건도
 * 초기화된다. 서버가 권위를 갖도록 pull/push 를 정의한다.
 *
 * 동기화 모델(단순·견고):
 *  · pull: 로그인·복귀 시 서버 스냅샷을 받아 로컬에 병합한다.
 *  · push: 채점·출석은 즉시 서버로 보내되, 실패하면 오프라인 큐가 대신 책임진다.
 *    (사용자는 기다리지 않는다 — 로컬을 먼저 반영하는 낙관적 갱신)
 */

/** 서버가 보관하는 학습 진행 스냅샷. */
export interface ProgressSnapshot {
  /** 카드 id → SRS 상태 */
  cards: Record<string, SrsCardState>;
  /** 날짜 키(YYYY-M-D) → 그날 학습한 카드 id 목록 */
  history: Record<string, string[]>;
  /** 출석한 날짜 키 → 체크인 시각(ms) */
  attendance: Record<string, number>;
  /** 서버 기준 마지막 갱신 시각(ISO) — 증분 동기화 확장 지점 */
  updatedAt: string | null;
}

export interface IProgressRepository {
  /** 서버에 보관된 진행 상황 전체를 가져온다(로그인·기기 변경 후 복원). */
  pull(): Promise<ProgressSnapshot>;
  /** 카드 한 장의 채점 결과를 보고한다. */
  pushGrade(cardId: string, grade: Grade, state: SrsCardState): Promise<void>;
  /** 출석 도장을 보고한다(날짜 키 기준으로 하루 1회). */
  pushAttendance(dayKey: string): Promise<void>;
}
