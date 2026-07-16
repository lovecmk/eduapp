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

/** 파생 학습 인사이트 — "한눈에 보는" 강화 지표. */
export interface LearningInsights {
  /** 최근 7일 학습 합계 */
  weeklyTotal: number;
  /** 최근 7일 중 학습한 날 수 */
  activeDays: number;
  /** 학습한 날 평균 카드 수 */
  avgPerActiveDay: number;
  /** 가장 잘하는 분야 */
  topCategory: string;
  topCategoryAccuracy: number;
  /** 보강이 필요한 분야 */
  weakCategory: string;
  weakCategoryAccuracy: number;
  /** 학습 레벨/칭호/다음 레벨까지 남은 카드 수 */
  level: number;
  levelTitle: string;
  nextLevelIn: number;
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
  /** 파생 인사이트(서버가 제공하면 채워짐) */
  insights?: LearningInsights;
}
