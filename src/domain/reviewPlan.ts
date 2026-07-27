import { isDue, type SrsCardState } from './srs';
import type { LearningCard } from './models/LearningCard';

/**
 * 오늘의 복습 계획.
 *
 * 왜 이 파일이 생겼는가 —
 * 간격반복 엔진(srs.ts)은 "어떤 카드를, 언제, 어떤 순서로" 다시 봐야 하는지 이미
 * 정확히 알고 있었다. 그런데 복습 화면은 그 답을 쓰지 않고 **고를 거리**만 늘어놓았다.
 * 오늘 배운 것, 저장한 것, 좋아요한 것, 분야별로… 전부 '무엇을 볼까'를 사용자에게
 * 다시 묻는 선택지였다.
 *
 * 그래서 복습에 의도가 없었다. 앱이 아는 답("지금 이 12장")을 두고
 * 사용자에게 매번 결정을 떠넘긴 셈이다.
 *
 * 이 모듈은 그 답을 문장으로 만든다. 화면은 계획을 만들지 않고 그대로 보여 주기만 한다.
 */

/** 복습을 지금 해야 하는 이유 — 화면의 말투와 강조가 여기서 갈린다. */
export type ReviewUrgency =
  /** 기한이 지난 카드가 있다. 가장 급하다 — 방치할수록 기억이 빠르게 무너진다. */
  | 'overdue'
  /** 오늘 예정된 카드가 있다. 제때 하는 것이 가장 효율이 좋다. */
  | 'today'
  /** 지금 볼 것은 없지만 다음 일정이 있다. */
  | 'resting'
  /** 아직 학습한 카드가 없다. */
  | 'empty';

export interface UpcomingDay {
  date: Date;
  count: number;
  isToday: boolean;
}

export interface ReviewPlan {
  /** 지금 복습할 카드 — 이미 우선순위대로 정렬돼 있다. */
  queue: LearningCard[];
  urgency: ReviewUrgency;
  /** 기한이 지난 장수(오늘 이전에 예정됐던 것). */
  overdue: number;
  /** 오늘 예정된 장수. */
  dueToday: number;
  /** 자주 잊는 카드 장수 — 같은 시간을 써도 여기서 효율이 가장 크다. */
  fragile: number;
  /** 지금 볼 것이 없을 때 다음 복습 시각. */
  nextDueAt: number | null;
  /** 앞으로 7일 복습 예정 분포. */
  upcoming: UpcomingDay[];
}

/** 한 번에 제시하는 최대 장수 — 마이크로러닝 부담을 넘기지 않는다. */
export const REVIEW_SESSION_CAP = 20;

/** 이만큼 잊었으면 '자주 잊는 카드'로 본다. */
export const FRAGILE_LAPSES = 2;

const DAY = 86_400_000;

/**
 * 복습 계획을 세운다.
 *
 * 정렬 기준(먼저 볼수록 앞):
 *  1. 기한이 오래 지난 것 — 방치된 기억이 가장 빨리 사라진다.
 *  2. 같은 기한이면 자주 잊은 것 — 반복 실패는 아직 자리 잡지 못했다는 신호다.
 *
 * 무작위로 섞지 않는 것이 중요하다. 섞으면 '공평'해 보이지만, 가장 급한 카드가
 * 세션 끝으로 밀려 그날 못 보고 넘어갈 수 있다.
 */
export function buildReviewPlan(
  cards: LearningCard[],
  states: Record<string, SrsCardState | undefined>,
  now: number = Date.now(),
): ReviewPlan {
  const startOfToday = startOfDay(now);

  const withState = cards
    .map((card) => ({ card, state: states[card.id] }))
    .filter((x): x is { card: LearningCard; state: SrsCardState } => !!x.state);

  const dueList = withState.filter(({ state }) => isDue(state, now));

  const sorted = [...dueList].sort((a, b) => {
    if (a.state.dueAt !== b.state.dueAt) return a.state.dueAt - b.state.dueAt;
    return b.state.lapses - a.state.lapses;
  });

  const overdue = dueList.filter(({ state }) => state.dueAt < startOfToday).length;
  const fragile = dueList.filter(({ state }) => state.lapses >= FRAGILE_LAPSES).length;

  const queue = sorted.slice(0, REVIEW_SESSION_CAP).map((x) => x.card);

  return {
    queue,
    urgency: decideUrgency(dueList.length, overdue, withState.length),
    overdue,
    dueToday: dueList.length - overdue,
    fragile,
    nextDueAt: findNextDue(withState, now),
    upcoming: buildUpcoming(withState, now),
  };
}

function decideUrgency(dueCount: number, overdue: number, studiedCount: number): ReviewUrgency {
  if (studiedCount === 0) return 'empty';
  if (overdue > 0) return 'overdue';
  if (dueCount > 0) return 'today';
  return 'resting';
}

/**
 * 지금 왜 복습해야 하는지 한 줄로 설명한다.
 *
 * 숫자만 보여 주면 "12장"이 많은 건지 적은 건지, 급한 건지 알 수 없다.
 * 문장이 있어야 사용자가 지금 시작할 이유를 갖는다.
 */
export function describePlan(plan: ReviewPlan): { title: string; detail: string } {
  switch (plan.urgency) {
    case 'overdue': {
      const parts = [`기한이 지난 ${plan.overdue}장`];
      if (plan.dueToday > 0) parts.push(`오늘 ${plan.dueToday}장`);
      if (plan.fragile > 0) parts.push(`자주 잊는 ${plan.fragile}장 포함`);
      return {
        title: `지금 복습할 ${plan.queue.length}장`,
        // 미루면 손해라는 사실을 감정이 아니라 이유로 전달한다.
        detail: `${parts.join(' · ')} — 미룰수록 처음부터 다시 외우게 돼요`,
      };
    }
    case 'today': {
      const detail =
        plan.fragile > 0
          ? `오늘 예정 ${plan.dueToday}장 · 자주 잊는 ${plan.fragile}장 포함`
          : `오늘 예정 ${plan.dueToday}장 — 지금이 가장 오래 남는 때예요`;
      return { title: `지금 복습할 ${plan.queue.length}장`, detail };
    }
    case 'resting':
      return {
        title: '오늘 복습은 끝났어요',
        detail: plan.nextDueAt
          ? `다음 복습은 ${formatDueLabel(plan.nextDueAt)}에 열려요`
          : '새 카드를 학습하면 복습 일정이 잡혀요',
      };
    case 'empty':
      return {
        title: '아직 복습할 카드가 없어요',
        detail: '학습을 시작하면 잊을 때쯤 여기서 다시 만나요',
      };
  }
}

/** '오늘/내일/8월 3일' 같은 사람이 읽는 날짜. */
export function formatDueLabel(at: number, now: number = Date.now()): string {
  const days = Math.round((startOfDay(at) - startOfDay(now)) / DAY);
  if (days <= 0) return '오늘';
  if (days === 1) return '내일';
  if (days === 2) return '모레';
  const d = new Date(at);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function findNextDue(
  withState: { state: SrsCardState }[],
  now: number,
): number | null {
  const future = withState
    .map((x) => x.state.dueAt)
    .filter((t) => t > now)
    .sort((a, b) => a - b);
  return future[0] ?? null;
}

function buildUpcoming(withState: { state: SrsCardState }[], now: number): UpcomingDay[] {
  const today = startOfDay(now);
  const days: UpcomingDay[] = Array.from({ length: 7 }, (_, i) => ({
    date: new Date(today + i * DAY),
    count: 0,
    isToday: i === 0,
  }));
  for (const { state } of withState) {
    // 기한이 지난 것도 '오늘 할 일'로 모은다 — 지난 날짜 칸을 따로 두면
    // 사용자는 이미 지나간 날을 보며 아무것도 할 수 없다.
    const offset = Math.max(0, Math.round((startOfDay(state.dueAt) - today) / DAY));
    if (offset < days.length) days[offset]!.count += 1;
  }
  return days;
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
