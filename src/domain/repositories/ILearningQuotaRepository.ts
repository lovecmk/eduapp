import type { LearningQuota } from '../models/LearningQuota';

/**
 * 하루 학습 할당량 저장소.
 * 신규 학습은 상한이 있고 복습은 자유 — 이 계약은 '신규 학습' 상한만 다룬다.
 *
 * 실서버 연동 시(권장): 서버가 사용자별 오늘 학습 수를 권위 있게 관리한다.
 *  · getQuota()        → GET  /inner/api/v1/learning/quota
 *  · recordCompletion  → POST /inner/api/v1/learning/complete  (신규 카드 학습 완료 보고)
 */
export interface ILearningQuotaRepository {
  /** 오늘의 신규 학습 할당량 조회. */
  getQuota(): Promise<LearningQuota>;
  /** 신규 카드 n장 학습 완료를 서버에 보고(오프라인은 로컬 반영). */
  recordCompletion(count: number): Promise<void>;
}
