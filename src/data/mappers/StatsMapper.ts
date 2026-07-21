import type { StatsDTO } from '../dto/StatsDTO';
import type { StudyStats } from '../../domain/models/StudyStats';

export class StatsMapper {
  static toDomain(dto: StatsDTO): StudyStats {
    return {
      streakDays: dto.streak_days ?? 0,
      bestStreak: dto.best_streak ?? 0,
      totalLearned: dto.total_learned ?? 0,
      totalCards: dto.total_cards ?? 0,
      accuracy: (dto.accuracy_rate ?? 0) / 100,
      dueToday: dto.due_today ?? 0,
      weekly: dto.weekly ?? [],
      categoryBreakdown: dto.category_breakdown ?? [],
      rankings: dto.rankings ?? [],
      insights: dto.insights
        ? {
            weeklyTotal: dto.insights.weekly_total ?? 0,
            activeDays: dto.insights.active_days ?? 0,
            avgPerActiveDay: dto.insights.avg_per_active_day ?? 0,
            topCategory: dto.insights.top_category ?? '',
            topCategoryAccuracy: dto.insights.top_category_accuracy ?? 0,
            weakCategory: dto.insights.weak_category ?? '',
            weakCategoryAccuracy: dto.insights.weak_category_accuracy ?? 0,
            level: dto.insights.level ?? 1,
            levelTitle: dto.insights.level_title ?? '',
            nextLevelIn: dto.insights.next_level_in ?? 0,
          }
        : undefined,
    };
  }
}
