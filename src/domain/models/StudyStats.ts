// 학습 통계 도메인 모델 — 통계 화면(PART 3.3)
export interface DailyProgress {
  /** "월","화"... 요일 라벨 */
  label: string;
  /** 그날 학습한 카드 수 */
  count: number;
}

export interface CategoryBreakdown {
  category: string;
  total: number;
  mastered: number;
  accuracy: number;
}

export interface RankingEntry {
  rank: number;
  nickname: string;
  score: number;
}

export interface StudyStats {
  /** 연속 학습 일수 */
  streakDays: number;
  /** 최대 연속 학습 기록 */
  bestStreak: number;
  /** 누적 학습 카드 수 */
  totalLearned: number;
  /** 전체 카드 수 */
  totalCards: number;
  /** 정답률 (0~1) */
  accuracy: number;
  /** 오늘 복습 예정 카드 수 */
  dueToday: number;
  /** 최근 7일 진행 */
  weekly: DailyProgress[];
  /** 카테고리별 분석 */
  categoryBreakdown: CategoryBreakdown[];
  rankings: RankingEntry[];
}
