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
}
