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

describe('buildReviewPlan — 무엇을 먼저 보여 줄 것인가', () => {
  it('마지막으로 본 지 오래된 카드를 맨 앞에 둔다', () => {
    // 몇 장만 보고 그만두는 날에, 지금 보면 가장 도움이 될 카드가 앞에 있어야 한다.
    const cards = [card('c1'), card('c2'), card('c3')];
    const states = {
      c1: state({ dueAt: NOW - 1 * DAY }),
      c2: state({ dueAt: NOW - 5 * DAY }),
      c3: state({ dueAt: NOW - 3 * DAY }),
    };
    const plan = buildReviewPlan(cards, states, NOW);
    expect(plan.queue.map((c) => c.id)).toEqual(['c2', 'c3', 'c1']);
  });

  it('본 지 지난 시간이 같으면 자주 잊은 카드를 먼저 보여 준다', () => {
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
    // 잘라내더라도 지금 보면 가장 도움이 될 것부터 담겨 있어야 한다.
    expect(plan.queue[0]!.id).toBe('c39');
  });

  it('학습한 적 없는 카드는 계획에 들어오지 않는다', () => {
    const plan = buildReviewPlan([card('c1'), card('c2')], { c1: state({ dueAt: NOW - DAY }) }, NOW);
    expect(plan.queue.map((c) => c.id)).toEqual(['c1']);
  });
});

describe('buildReviewPlan — 왜 지금 보면 좋은가', () => {
  it('오래 쉰 카드 수를 센다 — 밀린 양이 아니라 구성 설명이다', () => {
    const cards = [card('c1'), card('c2'), card('c3')];
    const states = {
      c1: state({ dueAt: NOW - 2 * DAY }), // 하루 넘게 쉬었다
      c2: state({ dueAt: NOW - 60_000 }), // 오늘, 방금 때가 됐다
      c3: state({ dueAt: NOW + DAY }), // 아직
    };
    const plan = buildReviewPlan(cards, states, NOW);
    expect(plan.longRested).toBe(1);
    expect(plan.queue).toHaveLength(2);
    // 오래 쉰 카드가 있다고 해서 상태가 달라지지는 않는다.
    // 급함을 등급으로 나누는 순간 화면이 그것을 경고로 그리게 된다.
    expect(plan.state).toBe('ready');
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

  it('볼 것이 없으면 쉬어 가는 상태이고, 다음 카드 시각을 알려 준다', () => {
    const cards = [card('c1')];
    const states = { c1: state({ dueAt: NOW + 3 * DAY }) };
    const plan = buildReviewPlan(cards, states, NOW);
    expect(plan.state).toBe('resting');
    expect(plan.queue).toHaveLength(0);
    expect(plan.nextDueAt).toBe(NOW + 3 * DAY);
  });

  it('학습 이력이 없으면 empty', () => {
    expect(buildReviewPlan([card('c1')], {}, NOW).state).toBe('empty');
  });
});

describe('upcoming — 돌아올 이유', () => {
  it('7일치를 만들고 오늘을 표시한다', () => {
    const plan = buildReviewPlan([card('c1')], { c1: state({ dueAt: NOW + DAY }) }, NOW);
    expect(plan.upcoming).toHaveLength(7);
    expect(plan.upcoming[0]!.isToday).toBe(true);
    expect(plan.upcoming[1]!.count).toBe(1);
  });

  it('예정 시각이 지난 카드도 오늘 칸에 모은다', () => {
    // 지나간 날짜 칸을 따로 두면 사용자는 아무것도 할 수 없는 날을 보게 된다.
    const plan = buildReviewPlan([card('c1')], { c1: state({ dueAt: NOW - 10 * DAY }) }, NOW);
    expect(plan.upcoming[0]!.count).toBe(1);
  });

  it('7일 밖의 일정은 넣지 않는다', () => {
    const plan = buildReviewPlan([card('c1')], { c1: state({ dueAt: NOW + 30 * DAY }) }, NOW);
    expect(plan.upcoming.reduce((sum, d) => sum + d.count, 0)).toBe(0);
  });
});

describe('describePlan — 권하되 재촉하지 않는다', () => {
  it('자주 잊는 카드가 섞여 있으면 그 사실만 알려 준다', () => {
    const cards = [card('c1'), card('c2')];
    const states = {
      c1: state({ dueAt: NOW - 3 * DAY, lapses: 2 }),
      c2: state({ dueAt: NOW - 60_000 }),
    };
    const { title, detail } = describePlan(buildReviewPlan(cards, states, NOW));
    expect(title).toBe('복습하기 좋은 2장');
    expect(detail).toBe('자주 잊는 1장이 함께 있어요');
  });

  it('평범한 날은 지금 보면 좋은 이유를 말한다', () => {
    const plan = buildReviewPlan([card('c1')], { c1: state({ dueAt: NOW - 60_000 }) }, NOW);
    const { title, detail } = describePlan(plan);
    expect(title).toBe('복습하기 좋은 1장');
    expect(detail).toContain('오래 남아요');
  });

  it('볼 것이 없으면 쉬어도 된다고 말한다 — 끝냈다고 하지 않는다', () => {
    // '오늘 치를 다 했다'고 말하는 순간, 안 한 날은 자동으로 빚이 된다.
    const plan = buildReviewPlan([card('c1')], { c1: state({ dueAt: NOW + 2 * DAY }) }, NOW);
    const { title, detail } = describePlan(plan);
    expect(title).toBe('지금은 쉬어도 좋아요');
    expect(detail).toContain('모레');
  });

  it('어떤 상태에서도 마감·부채의 말을 쓰지 않는다', () => {
    // 복습은 자유의지다. 안 했을 때 잃는 것을 들먹이면 안내가 아니라 협박이 된다.
    const forbidden = ['기한', '지남', '지났', '밀린', '미룰수록', '늦', '놓치', '남은 복습'];
    const plans = [
      buildReviewPlan(
        [card('c1'), card('c2')],
        { c1: state({ dueAt: NOW - 9 * DAY, lapses: 4 }), c2: state({ dueAt: NOW - DAY }) },
        NOW,
      ),
      buildReviewPlan([card('c1')], { c1: state({ dueAt: NOW - 60_000 }) }, NOW),
      buildReviewPlan([card('c1')], { c1: state({ dueAt: NOW + 2 * DAY }) }, NOW),
      buildReviewPlan([card('c1')], {}, NOW),
    ];
    for (const p of plans) {
      const { title, detail } = describePlan(p);
      for (const word of forbidden) {
        expect(`${title} ${detail}`).not.toContain(word);
      }
    }
  });

  it('다음 카드 시각을 모르면 일정을 지어내지 않는다', () => {
    const { detail } = describePlan(buildReviewPlan([card('c1')], {}, NOW));
    expect(detail).toBe('학습을 시작하면 잊을 때쯤 여기서 다시 만나요');
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
