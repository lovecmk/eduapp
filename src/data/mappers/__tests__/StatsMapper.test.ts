import { StatsMapper } from '../StatsMapper';
import type { StatsDTO } from '../../dto/StatsDTO';

const base: StatsDTO = {
  streak_days: 5,
  best_streak: 12,
  total_learned: 130,
  total_cards: 300,
  accuracy_rate: 82, // 0~100
  due_today: 4,
  weekly: [{ label: '월', count: 3 }],
  category_breakdown: [{ category: '전기 위험', total: 10, mastered: 4, accuracy: 70 }],
  rankings: [{ rank: 1, nickname: '현장왕', score: 999 }],
};

describe('StatsMapper.toDomain', () => {
  it('accuracy_rate(0~100) 를 0~1 로 정규화한다', () => {
    expect(StatsMapper.toDomain(base).accuracy).toBeCloseTo(0.82, 5);
  });

  it('배열/스칼라 필드를 그대로 매핑한다', () => {
    const s = StatsMapper.toDomain(base);
    expect(s.streakDays).toBe(5);
    expect(s.bestStreak).toBe(12);
    expect(s.weekly).toHaveLength(1);
    expect(s.categoryBreakdown[0].category).toBe('전기 위험');
    expect(s.rankings[0].nickname).toBe('현장왕');
  });

  it('누락된 배열 필드는 빈 배열로 안전 폴백한다', () => {
    const partial = { streak_days: 1 } as unknown as StatsDTO;
    const s = StatsMapper.toDomain(partial);
    expect(s.weekly).toEqual([]);
    expect(s.categoryBreakdown).toEqual([]);
    expect(s.rankings).toEqual([]);
    expect(s.accuracy).toBe(0);
    expect(s.totalLearned).toBe(0);
  });

  it('insights 미제공(구버전 서버) 시 undefined', () => {
    expect(StatsMapper.toDomain(base).insights).toBeUndefined();
  });

  it('insights 제공 시 camelCase 로 매핑한다', () => {
    const s = StatsMapper.toDomain({
      ...base,
      insights: {
        weekly_total: 20,
        active_days: 5,
        avg_per_active_day: 4,
        top_category: '전기 위험',
        top_category_accuracy: 90,
        weak_category: '위험물',
        weak_category_accuracy: 40,
        level: 3,
        level_title: '정예',
        next_level_in: 15,
      },
    });
    expect(s.insights).toBeDefined();
    expect(s.insights?.weeklyTotal).toBe(20);
    expect(s.insights?.topCategory).toBe('전기 위험');
    expect(s.insights?.levelTitle).toBe('정예');
    expect(s.insights?.nextLevelIn).toBe(15);
  });
});
