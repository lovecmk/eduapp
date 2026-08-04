import type { CardDifficulty } from './models/LearningCard';

/**
 * 오늘의 출제 규칙 — 앱 쪽 한 벌.
 *
 * 서버의 `backend/internal/service/daily_plan.go` 와 **같은 규칙**이다.
 * 두 벌을 두는 이유는 오프라인 때문이다. 이 앱은 지하·철골 구조물에서 쓰여
 * 서버에 닿지 못하는 날이 흔한데, 그때 "오늘의 학습이 없습니다"를 띄우면
 * 그날 학습은 그냥 없던 일이 된다. 서버에 닿으면 서버 편성을 쓰고,
 * 닿지 못하면 여기서 같은 규칙으로 만든다.
 *
 * ⚠️ 한쪽만 고치면 온라인·오프라인에서 서로 다른 문제가 나온다. 규칙을 바꿀 때는
 *    반드시 두 파일을 함께 고칠 것. 양쪽 다 검사가 붙어 있다.
 *
 * ── 규칙 ──────────────────────────────────────────────────────────────
 *  ① 오늘의 난이도를 사람마다 정한다 — 그동안의 기록(기억 상자·되돌아간 횟수)으로.
 *  ② 난이도가 오늘의 **출제 수**를 정한다 — 쉬우면 많이(5), 어려우면 적게(3).
 *  ③ 복습 도래 카드를 먼저 채우고, 남는 자리를 새 카드로 채운다.
 *  ④ 뽑는 순서는 (사람, 날짜) 시드로 섞는다 — 같은 날엔 늘 같은 문제,
 *     날이 바뀌면 다른 문제, 사람이 다르면 다른 문제.
 */

/** 출제 후보 한 장. */
export interface PlanCandidate {
  cardId: string;
  difficulty: CardDifficulty;
  /** 복습 예정이 이미 지난 카드(기억이 무너지기 직전). */
  due?: boolean;
  /** 한 번이라도 학습한 적이 있는 카드. */
  seen?: boolean;
  /** 복습이 밀린 정도(클수록 오래 방치). 복습 정렬에만 쓴다. */
  overdueRank?: number;
}

/** 오늘의 난이도를 정하는 데 쓰는 그 사람의 학습 기록 요약. */
export interface LearnerSignal {
  reps: number;
  lapses: number;
  avgBox: number;
}

export interface DailyPlan {
  difficulty: CardDifficulty;
  targetCount: number;
  cardIds: string[];
}

/** 출제 수의 한계 — 어떤 설정으로도 '하루 3분'의 범위를 벗어나지 않는다. */
export const MIN_DAILY_CARDS = 1;
export const MAX_DAILY_CARDS = 10;

/** 표본이 이보다 적으면 난이도를 올리지 않는다 — 세 번 맞힌 것은 우연이다. */
const MIN_REPS_TO_JUDGE = 12;

const DIFFICULTY_RANK: Record<CardDifficulty, number> = { easy: 0, medium: 1, hard: 2 };

/**
 * 그 사람에게 오늘 맞는 난이도.
 *
 * 교육앱에서 난이도는 고정 설정이 아니라 **관찰의 결과**여야 한다. 잘 따라오는
 * 사람에게 계속 쉬운 문제를 내면 지루해서 떠나고, 힘들어하는 사람에게 어려운
 * 문제를 내면 좌절해서 떠난다. 둘 다 이탈이라는 같은 결과로 끝난다.
 */
export function targetDifficulty(sig: LearnerSignal): CardDifficulty {
  if (sig.reps < MIN_REPS_TO_JUDGE) return 'easy';
  const lapseRate = sig.lapses / sig.reps;
  if (lapseRate >= 0.35) return 'easy';
  if (lapseRate <= 0.15 && sig.avgBox >= 3) return 'hard';
  return 'medium';
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * 난이도별 출제 수.
 *
 * 어려울수록 적게 낸다. 한 장에 드는 시간과 집중이 다르기 때문이다 —
 * 어려운 문제 5장은 '하루 3분'이 아니라 '하루 10분'이고, 그러면 사람은
 * 아예 열지 않는다.
 */
export function countForDifficulty(d: CardDifficulty, min: number, max: number): number {
  let n: number;
  if (d === 'easy') n = max;
  else if (d === 'hard') n = min;
  else {
    n = Math.floor((min + max) / 2);
    // 애매하면 한 장 더 주는 쪽이 학습에는 낫다(3~4 는 4).
    if ((min + max) % 2 === 1) n += 1;
  }
  return clamp(n, min, max);
}

/** (사람, 날짜) 시드 — FNV-1a 32bit. 서버와 같은 뜻이면 되고 값이 같을 필요는 없다. */
function planSeed(userId: string, day: string): number {
  const src = `${userId}|${day}`;
  let h = 2166136261;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 시드로 결정적으로 섞는다(Fisher–Yates + mulberry32). */
function shuffleBySeed<T extends { cardId: string }>(items: T[], seed: number): T[] {
  // 먼저 순서를 고정한다 — 입력 순서에 기대면 같은 시드로도 결과가 달라진다.
  const out = [...items].sort((a, b) => (a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0));
  let state = seed || 1;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * 새 카드의 우선순위. 작을수록 먼저 나간다.
 *
 * 오늘의 난이도와 정확히 맞는 것이 1순위, 한 단계 차이가 2순위. 맞는 난이도가
 * 모자랄 때 빈손으로 돌려보내지 않기 위해서다 — 콘텐츠가 적은 초기에는
 * '어려움'만 남아 있는 날도 있다. 같은 순위 안에서는 아직 안 본 카드를 앞세운다.
 */
function freshRank(c: PlanCandidate, target: CardDifficulty): number {
  const gap = Math.abs(DIFFICULTY_RANK[c.difficulty] - DIFFICULTY_RANK[target]);
  return gap * 2 + (c.seen ? 1 : 0);
}

/** 오늘의 편성을 만든다. */
export function buildDailyPlan(
  userId: string,
  day: string,
  sig: LearnerSignal,
  candidates: PlanCandidate[],
  min: number,
  max: number,
): DailyPlan {
  let lo = clamp(min, MIN_DAILY_CARDS, MAX_DAILY_CARDS);
  let hi = clamp(max, MIN_DAILY_CARDS, MAX_DAILY_CARDS);
  if (lo > hi) [lo, hi] = [hi, lo];

  const difficulty = targetDifficulty(sig);
  const targetCount = countForDifficulty(difficulty, lo, hi);
  const seed = planSeed(userId, day);

  // 복습이 먼저다. 새 것을 배우는 것보다 무너지려는 기억을 붙잡는 것이 먼저다 —
  // 복습을 뒤로 밀면 어제 배운 것을 잊은 채 새 것만 쌓인다.
  // 여기만 섞지 않는다: 오래 밀린 것부터라는 순서 자체가 정보다.
  const due = candidates
    .filter((c) => c.due)
    .sort((a, b) => (b.overdueRank ?? 0) - (a.overdueRank ?? 0) || (a.cardId < b.cardId ? -1 : 1));

  const fresh = shuffleBySeed(
    candidates.filter((c) => !c.due),
    seed,
  ).sort((a, b) => freshRank(a, difficulty) - freshRank(b, difficulty));

  const cardIds: string[] = [];
  const seenIds = new Set<string>();
  for (const c of [...due, ...fresh]) {
    if (cardIds.length >= targetCount) break;
    if (seenIds.has(c.cardId)) continue;
    seenIds.add(c.cardId);
    cardIds.push(c.cardId);
  }
  return { difficulty, targetCount, cardIds };
}
