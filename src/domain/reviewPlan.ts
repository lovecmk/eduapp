import { isDue, type SrsCardState } from './srs';
import { startOfDay as startOfDayDate } from '../utils/dateKey';
import type { LearningCard } from './models/LearningCard';
import { DAILY_REVIEW_CARDS } from '../constants/learning';

/**
 * 오늘의 복습 계획.
 *
 * 왜 이 파일이 생겼는가 —
 * 간격반복 엔진(srs.ts)은 "어떤 카드를, 언제, 어떤 순서로" 다시 봐야 하는지 이미
 * 정확히 알고 있었다. 그런데 복습 화면은 그 답을 쓰지 않고 **고를 거리**만 늘어놓았다.
 * 오늘 배운 것, 저장한 것, 좋아요한 것, 분야별로… 전부 '무엇을 볼까'를 사용자에게
 * 다시 묻는 선택지였다.
 *
 * 그래서 복습에 방향이 없었다. 앱이 아는 답("지금은 이 12장이 좋다")을 두고
 * 사용자에게 매번 결정을 떠넘긴 셈이다.
 *
 * 이 모듈은 그 답을 문장으로 만든다. 화면은 계획을 만들지 않고 그대로 보여 주기만 한다.
 *
 * ── 다만 '제안'이지 '독촉'이 아니다 ──────────────────────────────────────
 * 복습은 사용자가 하기로 정하는 일이다. 그래서 이 모듈은 마감·부채의 언어를 쓰지 않는다.
 *
 * 간격반복에서 예정일이 지난 것은 **잘못이 아니다.** 늦게 보면 그만큼 다음 간격이
 * 조정될 뿐이다. "기한이 지났다"는 말은 사용자를 재촉할 뿐 아니라 사실과도 다르다.
 * 우리가 아는 것은 "이 카드는 마지막으로 본 지 오래됐고, 지금 보면 기억에 잘 남는다"
 * 까지다. 딱 거기까지만 말한다.
 */

/**
 * 지금 복습 화면이 어떤 상태인가.
 *
 * 급한 정도(urgency)가 아니라 '상태'로 둔 것이 의도적이다. 급함을 등급으로 나누면
 * 화면이 그것을 경고로 표현하게 되고, 결국 사용자를 재촉하게 된다.
 */
export type ReviewState =
  /** 지금 보기 좋은 카드가 있다. */
  | 'ready'
  /** 지금은 볼 것이 없다. 쉬어도 되는 상태다. */
  | 'resting'
  /** 아직 학습한 카드가 없다. */
  | 'empty';

export interface UpcomingDay {
  date: Date;
  count: number;
  isToday: boolean;
}

export interface ReviewPlan {
  /** 지금 보기 좋은 카드 — 이미 순서대로 정렬돼 있다(세션 상한까지 잘린다). */
  queue: LearningCard[];
  /**
   * 지금 볼 수 있는 카드 총 장수 — 세션 상한을 적용하기 전 값.
   *
   * 화면 문구는 queue 길이를 쓴다(제시한 만큼만 말한다). 이 값은 하루 학습량 배분처럼
   * 실제 총량이 필요한 계산에만 쓴다.
   */
  dueCount: number;
  state: ReviewState;
  /**
   * 그중 마지막으로 본 지 하루 넘게 지난 장수.
   *
   * '밀린 양'이 아니라 구성 설명용이다. 화면에 계산서처럼 내밀지 않는다.
   */
  longRested: number;
  /** 자주 잊는 카드 장수 — 같은 시간을 써도 여기서 얻는 게 가장 크다. */
  fragile: number;
  /** 지금 볼 것이 없을 때, 다음 카드가 준비되는 시각. */
  nextDueAt: number | null;
  /** 앞으로 7일간 볼 카드 분포. */
  upcoming: UpcomingDay[];
  /**
   * 이 계획을 세운 시각.
   *
   * 계획과 문구가 **같은 시계**를 보게 하려고 함께 들고 다닌다.
   * describePlan 이 Date.now() 를 따로 읽으면 시계가 둘이 되고, 자정을 걸치는
   * 순간 '모레 준비돼요'라고 세운 계획이 '내일'로 읽히는 어긋남이 생긴다.
   */
  now: number;
}

/** 한 번에 제시하는 최대 장수 — 마이크로러닝 부담을 넘기지 않는다. */
export const REVIEW_SESSION_CAP = DAILY_REVIEW_CARDS;

/** 이만큼 잊었으면 '자주 잊는 카드'로 본다. */
export const FRAGILE_LAPSES = 2;

const DAY = 86_400_000;

/**
 * 복습 계획을 세운다.
 *
 * 정렬 기준(먼저 볼수록 앞):
 *  1. 마지막으로 본 지 오래된 것 — 지금 보면 기억에 가장 잘 남는다.
 *  2. 같으면 자주 잊은 것 — 아직 자리 잡지 못한 카드라 한 번 더 볼 값어치가 크다.
 *
 * 무작위로 섞지 않는 것이 중요하다. 섞으면 '공평'해 보이지만, 몇 장만 보고 그만두는
 * 날에 가장 도움이 될 카드가 뒤로 밀린다. 순서는 강요가 아니라 배려다.
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

  const longRested = dueList.filter(({ state }) => state.dueAt < startOfToday).length;
  const fragile = dueList.filter(({ state }) => state.lapses >= FRAGILE_LAPSES).length;

  const kstToday = Math.floor((now + 9 * 3600000) / DAY) * DAY - 9 * 3600000;
  const reviewedToday = withState.filter(({ state }) => state.reps > 1 &&
    (state.lastReviewedAt ?? 0) >= kstToday && (state.lastReviewedAt ?? 0) <= now).length;
  const remaining = Math.max(0, REVIEW_SESSION_CAP - reviewedToday);
  const queue = sorted.slice(0, remaining).map((x) => x.card);
  const exhausted = remaining === 0 && dueList.length > 0;

  return {
    queue,
    dueCount: exhausted ? 0 : dueList.length,
    state: decideState(queue.length, withState.length),
    longRested,
    fragile,
    nextDueAt: exhausted ? kstToday + DAY : findNextDue(withState, now),
    upcoming: buildUpcoming(withState, now),
    now,
  };
}

function decideState(dueCount: number, studiedCount: number): ReviewState {
  if (studiedCount === 0) return 'empty';
  return dueCount > 0 ? 'ready' : 'resting';
}

/**
 * 지금 화면에 쓸 문장을 만든다.
 *
 * 말투 규칙 — 권하되 재촉하지 않는다.
 *  · '해야 한다'가 아니라 '보기 좋다'로 말한다.
 *  · 안 했을 때 잃는 것을 들먹이지 않는다. 손실을 앞세우면 그건 안내가 아니라 협박이다.
 *  · 볼 것이 없는 날은 '끝냈다'가 아니라 '쉬어도 된다'로 말한다.
 *    복습을 다 한 것이 의무를 마친 것처럼 들리면, 안 한 날은 빚이 된다.
 *
 * 날짜 표현은 반드시 plan.now 를 기준으로 한다 — 계획을 세운 시계와 같아야 한다.
 */
export function describePlan(plan: ReviewPlan): { title: string; detail: string } {
  switch (plan.state) {
    case 'ready':
      return {
        title: `복습하기 좋은 ${plan.queue.length}장`,
        detail:
          plan.fragile > 0
            ? `자주 잊는 ${plan.fragile}장이 함께 있어요`
            : '기억이 흐려질 때쯤이라 지금 보면 오래 남아요',
      };
    case 'resting':
      return {
        title: '지금은 쉬어도 좋아요',
        detail: plan.nextDueAt
          ? `${formatDueLabel(plan.nextDueAt, plan.now)}쯤 다시 볼 카드가 준비돼요`
          : '새로 학습하면 다시 볼 시점이 잡혀요',
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
    // 예정 시각이 지난 것도 오늘 칸에 모은다 — 지난 날짜 칸을 따로 두면
    // 사용자는 이미 지나간 날을 보며 아무것도 할 수 없다.
    const offset = Math.max(0, Math.round((startOfDay(state.dueAt) - today) / DAY));
    if (offset < days.length) days[offset]!.count += 1;
  }
  return days;
}

/**
 * ms 기준 자정 — 계산이 전부 타임스탬프라 여기서만 ms 로 감싼다.
 * 자정의 정의 자체는 utils/dateKey 하나뿐이어야 한다(달력·스트릭과 어긋나면 안 된다).
 */
function startOfDay(ms: number): number {
  return startOfDayDate(new Date(ms)).getTime();
}
