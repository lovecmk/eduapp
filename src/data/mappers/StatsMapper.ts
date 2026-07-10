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
    };
  }
}
