import {
  buildReviewPlan,
  describePlan,
  formatDueLabel,
  REVIEW_SESSION_CAP,
} from '../reviewPlan';
import { initialState, type SrsCardState } from '../srs';
import type { LearningCard } from '../models/LearningCard';

// 복습의 '의도'는 여기서 정해진다. 화면은 이 계획을 보여 주기만 하므로,
// 무엇을 먼저 시킬지·왜 지금인지가 옳은지는 이 표로 검증한다.

const DAY = 86_400_000;
const NOW = new Date(2026, 6, 27, 14, 0, 0).getTime(); // 2026-07-27 14:00

function card(id: string, over: Partial<LearningCard> = {}): LearningCard {
  return {
    id,
    category: '전기 위험',
    subCategory: '',
    topic: '',
    keywords: [],
    title: id,
    question: `${id} 문제`,
    difficulty: 'easy',
    type: 'explanation',
    status: 'learning',
    studySeconds: 20,
    ...over,
  } as LearningCard;
}

function state(over: Partial<SrsCardState> = {}): SrsCardState {
  return { ...initialState(NOW), ...over };
}

describe('buildReviewPlan — 무엇을 먼저 시킬 것인가', () => {
  it('기한이 오래 지난 카드를 맨 앞에 둔다', () => {
    // 방치된 기억이 가장 빨리 사라진다. 급한 것을 뒤로 밀면 그날 못 보고 넘어간다.
    const cards = [card('c1'), card('c2'), card('c3')];
    const states = {
      c1: state({ dueAt: NOW - 1 * DAY }),
      c2: state({ dueAt: NOW - 5 * DAY }),
      c3: state({ dueAt: NOW - 3 * DAY }),
    };
    const plan = buildReviewPlan(cards, states, NOW);
    expect(plan.queue.map((c) => c.id)).toEqual(['c2', 'c3', 'c1']);
  });

  it('기한이 같으면 자주 잊은 카드를 먼저 시킨다', () => {
    // 반복 실패는 아직 자리 잡지 못했다는 신호다.
    const cards = [card('c1'), card('c2')];
    const states = {
      c1: state({ dueAt: NOW - DAY, lapses: 0 }),
      c2: state({ dueAt: NOW - DAY, lapses: 3 }),
    };
    const plan = buildReviewPlan(cards, states, NOW);
    expect(plan.queue.map((c) => c.id)).toEqual(['c2', 'c1']);
  });

  it('아직 때가 안 된 카드는 넣지 않는다', () => {
    // 너무 일찍 다시 보면 간격반복의 효과가 사라진다.
    const cards = [card('c1'), card('c2')];
    const states = { c1: state({ dueAt: NOW - DAY }), c2: state({ dueAt: NOW + 3 * DAY }) };
    const plan = buildReviewPlan(cards, states, NOW);
    expect(plan.queue.map((c) => c.id)).toEqual(['c1']);
  });

  it('한 세션 분량을 넘기지 않는다', () => {
    const cards = Array.from({ length: 40 }, (_, i) => card(`c${i}`));
    const states: Record<string, SrsCardState> = {};
    cards.forEach((c, i) => {
      states[c.id] = state({ dueAt: NOW - (i + 1) * DAY });
    });
    const plan = buildReviewPlan(cards, states, NOW);
    expect(plan.queue).toHaveLength(REVIEW_SESSION_CAP);
    // 잘라내더라도 가장 급한 것부터 담겨 있어야 한다.
    expect(plan.queue[0]!.id).toBe('c39');
  });

  it('학습한 적 없는 카드는 계획에 들어오지 않는다', () => {
    const plan = buildReviewPlan([card('c1'), card('c2')], { c1: state({ dueAt: NOW - DAY }) }, NOW);
    expect(plan.queue.map((c) => c.id)).toEqual(['c1']);
  });
});

describe('buildReviewPlan — 왜 지금인가', () => {
  it('기한 지난 것과 오늘 예정된 것을 구분해서 센다', () => {
    const cards = [card('c1'), card('c2'), card('c3')];
    const states = {
      c1: state({ dueAt: NOW - 2 * DAY }), // 지난 기한
      c2: state({ dueAt: NOW - 60_000 }), // 오늘, 방금 도래
      c3: state({ dueAt: NOW + DAY }), // 아직
    };
    const plan = buildReviewPlan(cards, states, NOW);
    expect(plan.overdue).toBe(1);
    expect(plan.dueToday).toBe(1);
    expect(plan.urgency).toBe('overdue');
  });

  it('자주 잊는 카드 수를 따로 알려 준다', () => {
    // 같은 시간을 써도 여기서 효율이 가장 크다.
    const cards = [card('c1'), card('c2')];
    const states = {
      c1: state({ dueAt: NOW - DAY, lapses: 2 }),
      c2: state({ dueAt: NOW - DAY, lapses: 0 }),
    };
    expect(buildReviewPlan(cards, states, NOW).fragile).toBe(1);
  });

  it('할 것이 없으면 다음 일정을 알려 준다', () => {
    const cards = [card('c1')];
    const states = { c1: state({ dueAt: NOW + 3 * DAY }) };
    const plan = buildReviewPlan(cards, states, NOW);
    expect(plan.urgency).toBe('resting');
    expect(plan.queue).toHaveLength(0);
    expect(plan.nextDueAt).toBe(NOW + 3 * DAY);
  });

  it('학습 이력이 없으면 empty', () => {
    expect(buildReviewPlan([card('c1')], {}, NOW).urgency).toBe('empty');
  });
});

describe('upcoming — 돌아올 이유', () => {
  it('7일치를 만들고 오늘을 표시한다', () => {
    const plan = buildReviewPlan([card('c1')], { c1: state({ dueAt: NOW + DAY }) }, NOW);
    expect(plan.upcoming).toHaveLength(7);
    expect(plan.upcoming[0]!.isToday).toBe(true);
    expect(plan.upcoming[1]!.count).toBe(1);
  });

  it('기한이 지난 카드도 오늘 칸에 모은다', () => {
    // 지나간 날짜 칸을 따로 두면 사용자는 아무것도 할 수 없는 날을 보게 된다.
    const plan = buildReviewPlan([card('c1')], { c1: state({ dueAt: NOW - 10 * DAY }) }, NOW);
    expect(plan.upcoming[0]!.count).toBe(1);
  });

  it('7일 밖의 일정은 넣지 않는다', () => {
    const plan = buildReviewPlan([card('c1')], { c1: state({ dueAt: NOW + 30 * DAY }) }, NOW);
    expect(plan.upcoming.reduce((sum, d) => sum + d.count, 0)).toBe(0);
  });
});

describe('describePlan — 숫자가 아니라 이유를 준다', () => {
  it('기한이 지났으면 미루면 손해라는 것을 말한다', () => {
    const cards = [card('c1'), card('c2')];
    const states = {
      c1: state({ dueAt: NOW - 3 * DAY, lapses: 2 }),
      c2: state({ dueAt: NOW - 60_000 }),
    };
    const { title, detail } = describePlan(buildReviewPlan(cards, states, NOW));
    expect(title).toBe('지금 복습할 2장');
    expect(detail).toContain('기한이 지난 1장');
    expect(detail).toContain('자주 잊는 1장');
    expect(detail).toContain('미룰수록');
  });

  it('오늘 예정만 있으면 지금이 적기라고 말한다', () => {
    const plan = buildReviewPlan([card('c1')], { c1: state({ dueAt: NOW - 60_000 }) }, NOW);
    const { title, detail } = describePlan(plan);
    expect(title).toBe('지금 복습할 1장');
    expect(detail).toContain('가장 오래 남는 때');
  });

  it('끝냈으면 다음 일정을 알려 준다', () => {
    const plan = buildReviewPlan([card('c1')], { c1: state({ dueAt: NOW + 2 * DAY }) }, NOW);
    const { title, detail } = describePlan(plan);
    expect(title).toBe('오늘 복습은 끝났어요');
    expect(detail).toContain('모레');
  });
});

describe('formatDueLabel', () => {
  it('가까운 날은 말로 읽는다', () => {
    expect(formatDueLabel(NOW, NOW)).toBe('오늘');
    expect(formatDueLabel(NOW + DAY, NOW)).toBe('내일');
    expect(formatDueLabel(NOW + 2 * DAY, NOW)).toBe('모레');
  });

  it('먼 날은 날짜로 읽는다', () => {
    expect(formatDueLabel(new Date(2026, 7, 3, 9, 0).getTime(), NOW)).toBe('8월 3일');
  });

  it('시각이 달라도 같은 날이면 오늘이다', () => {
    // 밤 11시에 예정된 카드를 아침에 보면 '오늘'이어야 한다.
    expect(formatDueLabel(new Date(2026, 6, 27, 23, 0).getTime(), NOW)).toBe('오늘');
  });
});
