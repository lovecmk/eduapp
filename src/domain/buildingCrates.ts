// 옥상 보물상자 — '함께 짓는 안전 빌딩'의 층수 보상.
//
// ── 예전에는 무엇이 있었나 ───────────────────────────────────────────────
// 빌딩 카드에 '5층 신규 카드팩 공개 · 20층 심화 문제 해금 · 50층 오프라인 안전
// 캠페인 후원' 같은 보상 문구가 있었지만 **어느 것도 앱·서버에 구현이 없었다.**
// 층수가 올라가도 아무 일도 일어나지 않았다.
//
// ── 지금 ────────────────────────────────────────────────────────────────
// 빌딩이 정해진 층에 닿으면 그 층의 상자가 옥상에 놓인다. 그 달에 **내가 벽돌을
// 충분히 올렸다면**(카드 학습 1장 = 벽돌 1장) 상자를 열어 카드팩·조각을 받는다.
//  · 다 같이 올린 층수(서버 집계) + 내 몫(이번 달 학습량) 두 조건이 함께 있어야
//    열린다 — 남이 지은 빌딩에 무임승차만 하면 열리지 않는다.
//  · 매달 1일 빌딩이 0층부터 다시 지어지고 상자도 새로 채워진다. 열지 않은 상자는
//    달이 바뀌면 사라진다.
//  · 수령 기록은 도감 스냅샷의 `claimedRules` 에 `bld:<YYYY-MM>:<층>` 키로 남는다.
//    서버의 도감 병합(키별 최댓값)이 그대로 받아 주므로 계약을 바꿀 필요가 없고,
//    다른 기기에서 같은 상자를 두 번 열 수 없다.
//
// **보상액은 이 파일만 정한다.** 화면은 "이 상자를 열겠다"고 말할 뿐이다.

export interface BuildingCrate {
  /** 상자가 놓이는 층 */
  floor: number;
  emoji: string;
  name: string;
  /** 상자에 붙은 한 줄 */
  flavor: string;
  /** 열려면 그 달에 내가 올려야 하는 벽돌(학습한 카드) 수 */
  bricks: number;
  /** 확정 카드팩 수 */
  packs: number;
  /** 깜짝 상자: 확정 대신 1~3팩을 무작위로 */
  surprise?: boolean;
  /** 안전 조각 */
  shards: number;
}

export const BUILDING_CRATES: BuildingCrate[] = [
  { floor: 5, emoji: '🧱', name: '벽돌 꾸러미', flavor: '기초 공사 완료! 첫 벽돌을 올린 모두에게', bricks: 1, packs: 1, shards: 0 },
  { floor: 10, emoji: '⛑️', name: '빌더 안전모 상자', flavor: '10층부터는 안전모 필수예요', bricks: 5, packs: 1, shards: 30 },
  { floor: 20, emoji: '🎁', name: '깜짝 자재 상자', flavor: '무엇이 들었는지 열어 봐야 알아요', bricks: 10, packs: 0, surprise: true, shards: 0 },
  { floor: 35, emoji: '🪙', name: '황금 벽돌', flavor: '고층부를 버틴 사람만 만질 수 있는 벽돌', bricks: 20, packs: 2, shards: 60 },
  { floor: 50, emoji: '🎉', name: '옥상 파티 상자', flavor: '상량식이다! 꼭대기까지 함께 올린 기념', bricks: 30, packs: 3, shards: 100 },
];

/** 깜짝 상자에서 나오는 팩 수와 그 확률(합 1). 평균 1.5팩. */
export const SURPRISE_TABLE: { packs: number; weight: number }[] = [
  { packs: 1, weight: 0.6 },
  { packs: 2, weight: 0.3 },
  { packs: 3, weight: 0.1 },
];

export const CRATE_KEY_PREFIX = 'bld:';

/** 도감 스냅샷의 claimedRules 에 남기는 수령 키. */
export const crateKey = (month: string, floor: number) => `${CRATE_KEY_PREFIX}${month}:${floor}`;

/** 'YYYY-MM' — 빌딩의 월 키와 같은 모양(로컬 시각 기준). */
export function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * 그 달에 내가 올린 벽돌 수.
 *
 * 두 원천 중 큰 값을 쓴다:
 *  · 학습 카운터(monthStudy) — 같은 카드를 여러 번 봐도 장마다 센다.
 *  · 복습 기록(SRS lastReviewedAt 이 그 달인 카드 수) — 서버와 동기화되는 값이라
 *    새 기기·재설치 뒤에도, 이 기능이 생기기 전에 한 이번 달 학습도 벽돌로 인정된다.
 */
export function monthBricks(
  month: string,
  counter: { monthStudy: number; monthStudyKey: string | null },
  srsCards: Record<string, { lastReviewedAt: number | null }>,
): number {
  const counted = counter.monthStudyKey === month ? counter.monthStudy : 0;
  let reviewed = 0;
  for (const st of Object.values(srsCards)) {
    if (st.lastReviewedAt != null && monthKey(new Date(st.lastReviewedAt)) === month) reviewed += 1;
  }
  return Math.max(counted, reviewed);
}

export const CRATE_BY_FLOOR: Record<number, BuildingCrate> = Object.fromEntries(
  BUILDING_CRATES.map((c) => [c.floor, c]),
);

/**
 * locked: 빌딩이 아직 그 층에 닿지 않았다
 * needBricks: 층은 닿았지만 내 벽돌이 모자란다
 * ready: 지금 열 수 있다
 * opened: 이번 달에 이미 열었다
 */
export type CrateState = 'locked' | 'needBricks' | 'ready' | 'opened';

export interface CrateStatus {
  crate: BuildingCrate;
  state: CrateState;
  /** 열기까지 더 필요한 벽돌(0 이상) */
  bricksLeft: number;
  /** 그 층까지 남은 층수(0 이상) */
  floorsLeft: number;
}

export interface CrateContext {
  /** 빌딩의 이번 달 키(서버 `current.month`) */
  month: string;
  /** 지금 층수(서버 집계) */
  floors: number;
  /** 그 달에 내가 올린 벽돌 */
  myBricks: number;
  /** 도감 스냅샷의 claimedRules */
  claimed: Record<string, number>;
}

export function evaluateCrate(crate: BuildingCrate, ctx: CrateContext): CrateStatus {
  const floorsLeft = Math.max(0, crate.floor - ctx.floors);
  const bricksLeft = Math.max(0, crate.bricks - ctx.myBricks);
  let state: CrateState;
  if ((ctx.claimed[crateKey(ctx.month, crate.floor)] ?? 0) > 0) state = 'opened';
  else if (floorsLeft > 0) state = 'locked';
  else if (bricksLeft > 0) state = 'needBricks';
  else state = 'ready';
  return { crate, state, bricksLeft, floorsLeft };
}

export function evaluateCrates(ctx: CrateContext): CrateStatus[] {
  return BUILDING_CRATES.map((c) => evaluateCrate(c, ctx));
}

/** 그 달에 연 상자 수 — 지난 달 기록 줄에 '📦 3' 으로 남긴다. */
export function openedCrateCount(month: string, claimed: Record<string, number>): number {
  return BUILDING_CRATES.filter((c) => (claimed[crateKey(month, c.floor)] ?? 0) > 0).length;
}

/** 상자에서 나오는 것. 깜짝 상자는 rng 로 굴린다. */
export function rollCrate(crate: BuildingCrate, rng: () => number = Math.random): { packs: number; shards: number } {
  if (!crate.surprise) return { packs: crate.packs, shards: crate.shards };
  const r = rng();
  let acc = 0;
  for (const row of SURPRISE_TABLE) {
    acc += row.weight;
    if (r < acc) return { packs: row.packs, shards: crate.shards };
  }
  return { packs: SURPRISE_TABLE[SURPRISE_TABLE.length - 1].packs, shards: crate.shards };
}

/** 상자 내용물을 사람이 읽는 말로. */
export function describeContents(crate: BuildingCrate): string {
  const parts: string[] = [];
  if (crate.surprise) parts.push('카드팩 1~3개 (무작위)');
  else if (crate.packs > 0) parts.push(`카드팩 ${crate.packs}개`);
  if (crate.shards > 0) parts.push(`안전 조각 ${crate.shards}`);
  return parts.join(' + ');
}
