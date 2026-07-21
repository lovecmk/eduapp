export interface StatsDTO {
  streak_days: number;
  best_streak: number;
  total_learned: number;
  total_cards: number;
  accuracy_rate: number; // 0~100
  due_today: number;
  weekly: { label: string; count: number }[];
  category_breakdown: { category: string; total: number; mastered: number; accuracy: number }[];
  rankings: { rank: number; nickname: string; score: number }[];
  /** 파생 학습 인사이트(통계 강화) — 구버전 서버 호환을 위해 선택적. */
  insights?: {
    weekly_total: number;
    active_days: number;
    avg_per_active_day: number;
    top_category: string;
    top_category_accuracy: number;
    weak_category: string;
    weak_category_accuracy: number;
    level: number;
    level_title: string;
    next_level_in: number;
  };
}
