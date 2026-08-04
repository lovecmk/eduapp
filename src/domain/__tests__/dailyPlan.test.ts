import {
  buildDailyPlan,
  countForDifficulty,
  targetDifficulty,
  type LearnerSignal,
  type PlanCandidate,
} from '../dailyPlan';
import type { CardDifficulty } from '../models/LearningCard';

// 이 규칙은 서버(backend/internal/service/daily_plan.go)와 한 벌이다.
// 오프라인에서 서버 없이도 같은 문제가 나와야 하므로, 양쪽에 같은 검사를 둔다.

const cand = (cardId: string, difficulty: CardDifficulty): PlanCandidate => ({ cardId, difficulty });

/** 난이도별로 넉넉한 후보. */
function pool(n: number): PlanCandidate[] {
  const out: PlanCandidate[] = [];
  for (let i = 0; i < n; i++) {
    const k = String(i).padStart(2, '0');
    out.push(cand(`e${k}`, 'easy'), cand(`m${k}`, 'medium'), cand(`h${k}`, 'hard'));
  }
  return out;
}

const blank: LearnerSignal = { reps: 0, lapses: 0, avgBox: 0 };

describe('난이도가 개수를 정한다 (3~5)', () => {
  it.each([
    ['처음 온 사람 → 쉬움 5문제', { reps: 0, lapses: 0, avgBox: 0 }, 'easy', 5],
    ['자주 잊는 사람 → 쉬움 5문제', { reps: 100, lapses: 40, avgBox: 1 }, 'easy', 5],
    ['보통 → 보통 4문제', { reps: 100, lapses: 25, avgBox: 2 }, 'medium', 4],
    ['잘 따라오는 사람 → 어려움 3문제', { reps: 100, lapses: 5, avgBox: 4 }, 'hard', 3],
  ] as [string, LearnerSignal, CardDifficulty, number][])(
    '%s',
    (_name, sig, difficulty, count) => {
      const plan = buildDailyPlan('u1', '2026-7-4', sig, pool(10), 3, 5);
      expect(plan.difficulty).toBe(difficulty);
      expect(plan.targetCount).toBe(count);
      expect(plan.cardIds).toHaveLength(count);
    },
  );

  it('표본이 적으면 난이도를 올리지 않는다', () => {
    // 다섯 번 맞힌 것은 관찰이 아니라 우연이다.
    expect(targetDifficulty({ reps: 5, lapses: 0, avgBox: 5 })).toBe('easy');
  });

  it('범위가 좁아도(3~3) 무너지지 않는다', () => {
    expect(countForDifficulty('easy', 3, 3)).toBe(3);
    expect(countForDifficulty('medium', 3, 3)).toBe(3);
    expect(countForDifficulty('hard', 3, 3)).toBe(3);
  });
});

describe('매일 다른 문제 · 사람마다 다른 문제', () => {
  it('같은 날 다시 물어도 같은 목록', () => {
    // 앱을 다시 열 때마다 문제가 바뀌면 학습이 아니라 뽑기다.
    const a = buildDailyPlan('u1', '2026-7-4', blank, pool(10), 3, 5);
    const b = buildDailyPlan('u1', '2026-7-4', blank, pool(10), 3, 5);
    expect(b.cardIds).toEqual(a.cardIds);
  });

  it('날이 바뀌면 목록이 달라진다', () => {
    let repeats = 0;
    let prev = '';
    for (let d = 1; d <= 10; d++) {
      const plan = buildDailyPlan('u1', `2026-7-${d}`, blank, pool(20), 3, 5);
      const key = plan.cardIds.join(',');
      if (key === prev) repeats++;
      prev = key;
    }
    expect(repeats).toBeLessThanOrEqual(1);
  });

  it('사람이 다르면 목록이 달라진다', () => {
    // 진도가 같다고 모두가 같은 카드를 받으면, 사람이 늘수록 그 획일성이 커진다.
    const base = buildDailyPlan('u1', '2026-7-4', blank, pool(20), 3, 5).cardIds.join(',');
    let identical = 0;
    for (let i = 0; i < 20; i++) {
      const other = buildDailyPlan(`user-${i}`, '2026-7-4', blank, pool(20), 3, 5);
      if (other.cardIds.join(',') === base) identical++;
    }
    expect(identical).toBeLessThanOrEqual(2);
  });
});

describe('편성 규칙', () => {
  it('복습이 먼저, 오래 밀린 것부터', () => {
    const plan = buildDailyPlan('u1', '2026-7-4', blank, [
      ...pool(10),
      { cardId: 'due-old', difficulty: 'hard', due: true, seen: true, overdueRank: 500 },
      { cardId: 'due-new', difficulty: 'easy', due: true, seen: true, overdueRank: 10 },
    ], 3, 5);
    expect(plan.cardIds.slice(0, 2)).toEqual(['due-old', 'due-new']);
  });

  it('후보가 모자라면 있는 만큼만 낸다', () => {
    const plan = buildDailyPlan('u1', '2026-7-4', blank, [cand('only', 'medium')], 3, 5);
    expect(plan.cardIds).toEqual(['only']);
    // 목표 자체는 그대로 알린다 — 화면이 "1/5" 로 진도를 보여줄 수 있어야 한다.
    expect(plan.targetCount).toBe(5);
  });

  it('후보가 없으면 빈 편성', () => {
    expect(buildDailyPlan('u1', '2026-7-4', blank, [], 3, 5).cardIds).toEqual([]);
  });

  it('같은 카드를 두 번 내지 않는다', () => {
    const plan = buildDailyPlan('u1', '2026-7-4', blank, [
      { cardId: 'same', difficulty: 'easy', due: true },
      cand('same', 'easy'),
      cand('other', 'easy'),
    ], 3, 5);
    expect(new Set(plan.cardIds).size).toBe(plan.cardIds.length);
  });

  it('맞는 난이도가 없으면 가까운 난이도로 채운다', () => {
    // 콘텐츠가 적은 초기에는 한 난이도만 남아 있는 날이 있다.
    const onlyHard = ['h1', 'h2', 'h3', 'h4', 'h5'].map((id) => cand(id, 'hard'));
    const plan = buildDailyPlan('u1', '2026-7-4', blank, onlyHard, 3, 5);
    expect(plan.cardIds).toHaveLength(5);
  });

  it('설정이 뒤집혀도 편성이 비지 않는다', () => {
    expect(buildDailyPlan('u1', '2026-7-4', blank, pool(10), 5, 3).cardIds.length).toBeGreaterThan(0);
  });
});
