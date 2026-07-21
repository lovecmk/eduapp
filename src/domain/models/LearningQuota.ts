// 하루 학습 할당량 도메인 모델.
// '신규 카드 학습'은 하루 상한이 있고(운영 지속가능성), '복습'은 자유다.
// 이 값의 원천(源)은 서버가 되어야 정확하다(기기 여러 대·시간대 문제 방지).
// 오프라인/목업에서는 로컬 스토어(dailyLearningStore)가 임시 원천 역할을 한다.
export interface LearningQuota {
  /** 오늘 신규 학습 상한. */
  limit: number;
  /** 오늘 이미 학습한 신규 카드 수. */
  used: number;
  /** 남은 신규 학습 수(= max(0, limit - used)). */
  remaining: number;
  /** 상한이 초기화되는 시각(다음 날 자정) ISO. */
  resetsAt: string;
}
