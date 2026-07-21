// 격려·축하 "순간"(Moment) 계산 — 학습 성취/기념일/누적 몰입을 감지해
// 앱을 켠 순간 인앱으로 전할 한 건의 메시지를 만든다. (알림 off 대비)
import { daysSinceFirstOpen } from '../store/momentStore';

export type MomentKind = 'welcome' | 'anniversary' | 'streak' | 'milestone' | 'comeback';

export interface Moment {
  key: string; // 중복 노출 방지용 고유 키
  kind: MomentKind;
  emoji: string;
  title: string;
  message: string;
  /** 강조 색상 힌트(모달 글로우) */
  accent: string;
}

export interface MomentInput {
  totalLearned: number;
  streakDays: number;
  /** 최초 실행 시각(ISO) */
  firstOpenAt: string | null;
  /** 누적 실행 횟수 */
  totalOpens: number;
  /** 마지막 실행 시각(ISO) — 오랜만의 복귀 감지 */
  lastOpenAt: string | null;
  /** 이미 축하한 키 목록 */
  celebrated: string[];
  now?: Date;
}

const ANNIVERSARY_DAYS = [7, 30, 50, 100, 200, 365, 500, 1000];
const STREAK_STEPS = [3, 7, 14, 30, 50, 100, 200, 365];
const LEARNED_STEPS = [10, 25, 50, 100, 200, 300, 500, 1000];

/** 1장당 약 40초 몰입으로 환산한 누적 몰입 시간(분). "총 얼마나 몰입했는지" 표현용. */
export function immersionMinutes(totalLearned: number): number {
  return Math.round((totalLearned * 40) / 60);
}

/** 누적 몰입을 사람이 읽기 좋은 문구로. */
export function immersionLabel(totalLearned: number): string {
  const m = immersionMinutes(totalLearned);
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest > 0 ? `${h}시간 ${rest}분` : `${h}시간`;
}

/** 배열에서 (threshold 이하 & 미축하) 중 가장 큰 값을 찾는다. */
function highestReached(steps: number[], value: number, celebrated: string[], prefix: string): number | null {
  let best: number | null = null;
  for (const s of steps) {
    if (value >= s && !celebrated.includes(`${prefix}-${s}`)) best = s;
  }
  return best;
}

/**
 * 지금 보여줄 축하 순간 1건을 계산한다(없으면 null).
 * 우선순위: 최초 환영 → 기념일 → 연속학습 → 누적학습 → 오랜만의 복귀.
 * 각 순간은 celebrated 로 한 번만 노출된다.
 */
export function computeMoment(input: MomentInput): Moment | null {
  const { totalLearned, streakDays, firstOpenAt, totalOpens, lastOpenAt, celebrated } = input;
  const now = input.now ?? new Date();

  // 1) 최초 실행 환영 — 알림을 켜지 않아도 첫 진입을 반겨준다.
  if (totalOpens <= 1 && !celebrated.includes('welcome')) {
    return {
      key: 'welcome',
      kind: 'welcome',
      emoji: '🎒',
      title: '현장학습에 오신 걸 환영해요!',
      message: '하루 3분이면 충분해요. 오늘부터 안전 지식을 한 장씩 쌓아가요. 함께 시작해볼까요?',
      accent: '#2563EB',
    };
  }

  // 2) 기념일 — 최초 실행 이후 경과 일수.
  const days = daysSinceFirstOpen(firstOpenAt, now);
  const anniv = highestReached(ANNIVERSARY_DAYS, days, celebrated, 'anniv');
  if (anniv !== null) {
    const label = anniv >= 365 ? `${Math.floor(anniv / 365)}주년` : `${anniv}일`;
    return {
      key: `anniv-${anniv}`,
      kind: 'anniversary',
      emoji: anniv >= 365 ? '🏆' : anniv >= 100 ? '🎉' : '🎈',
      title: `함께한 지 ${label}이 됐어요!`,
      message: `${label} 동안 안전을 놓지 않은 당신, 정말 대단해요. 지금까지 총 ${totalLearnedLabel(totalLearned)}을 배웠어요. 앞으로도 함께 나아가요!`,
      accent: '#F2705B',
    };
  }

  // 3) 연속 학습 기록.
  const streak = highestReached(STREAK_STEPS, streakDays, celebrated, 'streak');
  if (streak !== null) {
    return {
      key: `streak-${streak}`,
      kind: 'streak',
      emoji: streak >= 100 ? '🔥' : streak >= 30 ? '⚡' : '✨',
      title: `${streak}일 연속 학습 달성!`,
      message: `${streak}일 동안 하루도 빠짐없이 이어왔어요. 이 꾸준함이 현장을 지키는 힘이에요. 계속 가볼까요?`,
      accent: '#FF9500',
    };
  }

  // 4) 누적 학습 이정표 — "총 얼마나 몰입했는지" 강조.
  const learned = highestReached(LEARNED_STEPS, totalLearned, celebrated, 'learned');
  if (learned !== null) {
    return {
      key: `learned-${learned}`,
      kind: 'milestone',
      emoji: learned >= 500 ? '👑' : learned >= 100 ? '🏅' : '🌟',
      title: `누적 ${learned}장 학습 돌파!`,
      message: `지금까지 총 ${immersionLabel(totalLearned)}을 안전에 몰입했어요. 한 장 한 장이 사고 하나를 막는 힘이 돼요. 여기까지 오느라 정말 고생했어요!`,
      accent: '#34C759',
    };
  }

  // 5) 오랜만의 복귀 — 마지막 실행 후 7일 이상 지났을 때(하루 1회, 날짜 키).
  if (lastOpenAt) {
    const gap = daysSinceFirstOpen(lastOpenAt, now); // 같은 계산식 재사용(경과 일수)
    const dayKey = `comeback-${now.toISOString().slice(0, 10)}`;
    if (gap >= 7 && !celebrated.includes(dayKey)) {
      return {
        key: dayKey,
        kind: 'comeback',
        emoji: '🌈',
        title: '다시 만나서 반가워요!',
        message: `${gap}일 만이에요. 잠시 쉬어가도 괜찮아요. 오늘 가볍게 한 장부터 다시 시작해볼까요?`,
        accent: '#7E57C2',
      };
    }
  }

  return null;
}

function totalLearnedLabel(n: number): string {
  return `${n}장`;
}

/**
 * 히어로에 상시 노출할 짧은 격려 한 줄 — 진행 상태에 맞춰 "몰입/고생/전진"을 전한다.
 * 모달과 달리 매번 가볍게 보이므로, 스트릭/누적/오늘 진행을 반영한 다양한 문구를 돌린다.
 */
export function encourageLine(opts: { totalLearned: number; streakDays: number; todayDone: number; dueToday: number; seed?: number }): string {
  const { totalLearned, streakDays, todayDone, dueToday } = opts;
  const pool: string[] = [];

  if (todayDone > 0) pool.push(`오늘 벌써 ${todayDone}장! 몰입하는 모습이 멋져요 👏`);
  if (streakDays >= 3) pool.push(`${streakDays}일 연속 학습 중 — 이 흐름 그대로 가요 🔥`);
  if (dueToday > 0) pool.push(`복습 ${dueToday}장이 기다려요. 기억이 오래 남도록 잠깐만요 🔁`);
  if (totalLearned > 0) pool.push(`지금까지 총 ${immersionLabel(totalLearned)} 몰입했어요. 정말 잘하고 있어요 🌱`);
  pool.push('한 걸음씩, 오늘의 나도 어제보다 안전해지고 있어요 💪');
  pool.push('작은 3분이 모여 큰 안전이 돼요. 앞으로 나아가요 🚀');

  const seed = opts.seed ?? Math.floor(Date.now() / 60000);
  return pool[Math.abs(Math.trunc(seed)) % pool.length];
}
