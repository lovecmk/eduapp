// 학습 통계(목업) — 하드코딩된 가짜 수치 대신 '실제 로컬 학습 상태'에서 파생한다.
// 그래야 데이터 초기화 직후엔 0/빈 값이 되고, 학습할수록 정직하게 늘어난다(엄격한 상태 관리).
// (실서버 연동 시 GET /inner/api/v1/stats 로 대체 — 담당: 백엔드팀)
import type { IStatsRepository } from '../../domain/repositories/IStatsRepository';
import type { StudyStats, CategoryBreakdown } from '../../domain/models/StudyStats';
import { CARD_SEED } from '../cards.seed';
import { useCardProgressStore } from '../../store/cardProgressStore';
import { useAuthoredCardsStore } from '../../store/authoredCardsStore';
import { useSrsStore } from '../../store/srsStore';
import { useAttendanceStore } from '../../store/attendanceStore';
import { isDue } from '../../domain/srs';
import { dateKey } from '../../utils/dateKey';
import { delay } from './_delay';

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

/** 출석 도장(stamps)에서 가장 긴 연속 출석 일수를 구한다. */
function longestStreak(stamps: Record<string, number>): number {
  const days = Object.keys(stamps)
    .map((k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m, d).getTime(); })
    .sort((a, b) => a - b);
  if (days.length === 0) return 0;
  const DAY = 86_400_000;
  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    const gap = Math.round((days[i] - days[i - 1]) / DAY);
    if (gap === 1) run++;
    else if (gap > 1) run = 1;
    best = Math.max(best, run);
  }
  return best;
}

export class MockStatsRepository implements IStatsRepository {
  async getStudyStats(): Promise<StudyStats> {
    await delay(300);

    const statuses = useCardProgressStore.getState().status;
    const authored = useAuthoredCardsStore.getState().cards;
    const allSeed = [...CARD_SEED, ...authored];
    const totalCards = allSeed.length;

    let mastered = 0;
    let learning = 0;
    for (const s of Object.values(statuses)) {
      if (s === 'mastered') mastered++;
      else if (s === 'learning') learning++;
    }
    const totalLearned = mastered + learning;

    const attendance = useAttendanceStore.getState();
    const streakDays = attendance.currentStreak();
    const bestStreak = Math.max(streakDays, longestStreak(attendance.stamps));

    const srs = useSrsStore.getState();
    const now = Date.now();
    const dueToday = allSeed.filter((c) => { const st = srs.cards[c.id]; return st ? isDue(st, now) : false; }).length;

    // 최근 28일 학습량(캘린더 히트맵과 동일한 실제 history 기반).
    const weekly = Array.from({ length: 28 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (27 - i));
      return { label: WEEKDAY[d.getDay()], count: (srs.history[dateKey(d)] ?? []).length };
    });

    // 카테고리별 분석 — 시드 카드를 분야로 묶고, 마스터 수를 실제 상태에서 센다.
    const catMap = new Map<string, { total: number; mastered: number }>();
    for (const card of allSeed) {
      const prev = catMap.get(card.category) ?? { total: 0, mastered: 0 };
      prev.total++;
      if (statuses[card.id] === 'mastered') prev.mastered++;
      catMap.set(card.category, prev);
    }
    const categoryBreakdown: CategoryBreakdown[] = [...catMap.entries()].map(([category, v]) => ({
      category,
      total: v.total,
      mastered: v.mastered,
      accuracy: v.total > 0 ? v.mastered / v.total : 0,
    }));

    const accuracy = totalLearned > 0 ? mastered / totalLearned : 0;

    // 최근 7일 인사이트.
    const last7 = weekly.slice(-7);
    const weeklyTotal = last7.reduce((a, b) => a + b.count, 0);
    const activeDays = last7.filter((d) => d.count > 0).length;
    const avgPerActiveDay = activeDays > 0 ? Math.round((weeklyTotal / activeDays) * 10) / 10 : 0;
    const ranked = [...categoryBreakdown].sort((a, b) => b.accuracy - a.accuracy);
    const top = ranked[0];
    const weak = ranked[ranked.length - 1];
    const level = Math.floor(totalLearned / 10) + 1;
    const nextLevelIn = 10 - (totalLearned % 10);

    return {
      streakDays,
      bestStreak,
      totalLearned,
      totalCards,
      accuracy,
      dueToday,
      weekly,
      categoryBreakdown,
      // 리더보드는 커뮤니티(타인) 데모 데이터라 그대로 둔다.
      rankings: [
        { rank: 1, nickname: '김안전', score: 98 },
        { rank: 2, nickname: '박현장', score: 85 },
        { rank: 3, nickname: '최예방', score: 72 },
      ],
      insights: {
        weeklyTotal,
        activeDays,
        avgPerActiveDay,
        topCategory: top?.category ?? '-',
        topCategoryAccuracy: top ? Math.round(top.accuracy * 100) : 0,
        weakCategory: weak?.category ?? '-',
        weakCategoryAccuracy: weak ? Math.round(weak.accuracy * 100) : 0,
        level,
        levelTitle: level >= 5 ? '현장 전문가' : level >= 3 ? '현장 실무자' : '현장 입문자',
        nextLevelIn,
      },
    };
  }
}
