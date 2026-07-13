// TODO: 실제 API 연동 필요 - 담당: 백엔드팀 (GET /api/stats)
import type { IStatsRepository } from '../../domain/repositories/IStatsRepository';
import type { StudyStats } from '../../domain/models/StudyStats';
import { delay } from './_delay';

export class MockStatsRepository implements IStatsRepository {
  async getStudyStats(): Promise<StudyStats> {
    await delay(300);
    return {
      streakDays: 7,
      bestStreak: 14,
      totalLearned: 23,
      totalCards: 51,
      accuracy: 0.667,
      dueToday: 3,
      weekly: [
        { label: '월', count: 4 },
        { label: '화', count: 6 },
        { label: '수', count: 3 },
        { label: '목', count: 8 },
        { label: '금', count: 5 },
        { label: '토', count: 2 },
        { label: '일', count: 3 },
        { label: '월', count: 5 },
        { label: '화', count: 7 },
        { label: '수', count: 2 },
        { label: '목', count: 6 },
        { label: '금', count: 4 },
        { label: '토', count: 3 },
        { label: '일', count: 1 },
        { label: '월', count: 6 },
        { label: '화', count: 5 },
        { label: '수', count: 4 },
        { label: '목', count: 7 },
        { label: '금', count: 3 },
        { label: '토', count: 2 },
        { label: '일', count: 4 },
        { label: '월', count: 5 },
        { label: '화', count: 8 },
        { label: '수', count: 3 },
        { label: '목', count: 6 },
        { label: '금', count: 5 },
        { label: '토', count: 2 },
        { label: '일', count: 3 },
      ],
      categoryBreakdown: [
        { category: '전기 위험', total: 10, mastered: 6, accuracy: 0.72 },
        { category: '공정 위험', total: 20, mastered: 9, accuracy: 0.63 },
        { category: '위험물', total: 21, mastered: 8, accuracy: 0.6 },
      ],
      rankings: [
        { rank: 1, nickname: '김안전', score: 98 },
        { rank: 2, nickname: '박현장', score: 85 },
        { rank: 3, nickname: '최예방', score: 72 },
      ],
    };
  }
}
