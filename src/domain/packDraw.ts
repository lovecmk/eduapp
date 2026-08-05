// 카드팩 뽑기 규칙 — 도감 500종을 '언젠가는 모을 수 있게' 만드는 알고리즘.
//
// ── 왜 스토어가 아니라 여기 있나 ─────────────────────────────────────────
// 예전 규칙은 collectionStore 안에 15줄짜리 `drawOne()` 으로 박혀 있었고
// `Math.random()` 을 직접 불렀다. 그래서 **확률을 검사할 방법이 없었다** —
// 천장이 정말 도는지, 중복이 얼마나 나오는지 아무도 확인하지 못했다.
// 이 파일은 난수를 인자로 받는 순수 함수만 담는다. 덕분에 시드를 고정해
// 수만 번 돌려보는 테스트가 가능하다(__tests__/packDraw.test.ts).
//
// ── 세 겹의 장치 ────────────────────────────────────────────────────────
// 도감이 150종 → 500종이 되면서 "뽑아도 뽑아도 새 카드가 안 나온다"가
// 진짜 문제가 된다(쿠폰 수집가 문제). 그래서 세 가지를 겹쳐 뒀다:
//
//   1. 등급 가중치(DRAW_WEIGHTS)   — 팩을 여는 순간의 두근거림
//   2. 미보유 가중(NEW_CARD_WEIGHT) — 안 가진 카드를 더 자주 뽑아 수집을 끝나게
//   3. 천장(PITY_*)                 — 운이 나빠도 정해진 팩 안에 상위 등급 보장
//
// 그리고 그래도 나오는 중복은 **조각(shard)** 으로 바꿔 준다. 중복이 꽝이
// 아니라 원하는 카드를 사는 재화가 되면, 500종이라도 끝이 보인다.
import { RARITY_ORDER, RARITY_RANK, type RarityTier } from '../utils/rarity';
import { DRAW_WEIGHTS, PACK_SIZE, POOL_BY_RARITY } from '../data/collectibles';

// ── 튜닝 상수 ───────────────────────────────────────────────────────────

/** 미보유 카드에 주는 가중치 배수(보유 카드는 1). 높을수록 도감이 빨리 찬다. */
export const NEW_CARD_WEIGHT = 3;

/** 이 팩 수 안에는 루비(epic) 이상이 반드시 한 장 나온다. */
export const PITY_EPIC = 10;

/** 다이아몬드(legendary) 확률이 오르기 시작하는 팩 수(소프트 천장). */
export const PITY_LEGENDARY_SOFT = 35;

/** 이 팩 수 안에는 다이아몬드가 반드시 한 장 나온다(하드 천장). */
export const PITY_LEGENDARY_HARD = 60;

/** 소프트 천장 구간에서 팩당 더해지는 다이아몬드 확률. */
const SOFT_PITY_STEP = 0.01;

/** 중복 카드를 조각으로 바꿀 때의 등급별 지급량. */
export const SHARD_REWARD: Record<RarityTier, number> = { common: 2, rare: 5, epic: 12, legendary: 40 };

/** 조각으로 카드를 직접 교환할 때의 등급별 가격. */
export const SHARD_PRICE: Record<RarityTier, number> = { common: 30, rare: 90, epic: 260, legendary: 900 };

// ── 상태 ────────────────────────────────────────────────────────────────

/** 천장 계산에 필요한 누적 상태. 스토어가 영속화한다. */
export interface PityState {
  /** 마지막 루비 이상 이후 연 팩 수 */
  sinceEpic: number;
  /** 마지막 다이아몬드 이후 연 팩 수 */
  sinceLegendary: number;
}

export const INITIAL_PITY: PityState = { sinceEpic: 0, sinceLegendary: 0 };

export interface DrawResult {
  id: string;
  /** 이번에 처음 획득한 카드인지 */
  isNew: boolean;
  /** 중복이라 조각으로 바뀐 경우 그 개수(신규면 0) */
  shards: number;
}

export interface PackResult {
  results: DrawResult[];
  /** 이 팩에서 얻은 조각 합계 */
  shards: number;
  /** 갱신된 천장 상태 */
  pity: PityState;
}

/** 0 이상 1 미만의 난수를 주는 함수. 테스트는 시드 난수를 넣는다. */
export type Rng = () => number;

// ── 시드 난수(테스트·재현용) ─────────────────────────────────────────────

/** mulberry32 — 짧고 분포가 고른 시드 난수. dailyPlan 과 같은 계열을 쓴다. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── 등급 뽑기 ───────────────────────────────────────────────────────────

/**
 * 천장 상태를 반영한 등급별 확률표.
 *
 * 소프트 천장을 지나면 다이아몬드 확률이 팩마다 조금씩 오르고, 늘어난 몫은
 * 사파이어에서 가져온다(상위 등급끼리 뺏지 않게). 화면이 "지금 확률"을
 * 보여줄 수 있도록 밖으로 뺐다.
 */
export function weightsWithPity(pity: PityState): Record<RarityTier, number> {
  const over = Math.max(0, pity.sinceLegendary - PITY_LEGENDARY_SOFT);
  const bonus = Math.min(over * SOFT_PITY_STEP, 1 - DRAW_WEIGHTS.legendary);
  const w: Record<RarityTier, number> = { ...DRAW_WEIGHTS };
  w.legendary = DRAW_WEIGHTS.legendary + bonus;
  w.common = Math.max(0, DRAW_WEIGHTS.common - bonus);
  return w;
}

/**
 * 후보 등급들 중에서 가중치대로 하나를 고른다.
 *
 * ⚠️ 후보 목록(`tiers`)을 반드시 인자로 받는다. 예전엔 가중치 객체만 받고
 *    안에서 RARITY_ORDER 전체를 훑었는데, 천장 보정이 상위 등급만 담은
 *    '부분' 가중치를 넘기면 없는 키가 undefined 로 읽혀 합계가 NaN 이 됐다.
 *    그러면 모든 비교가 거짓이 되어 **항상 마지막 등급(다이아몬드)** 이
 *    나왔다 — 보정이 걸릴 때마다 전설이 튀어나오던 원인이다.
 */
function pickTier(tiers: readonly RarityTier[], weights: Record<RarityTier, number>, rng: Rng): RarityTier {
  const total = tiers.reduce((s, t) => s + weights[t], 0);
  let r = rng() * total;
  for (const t of tiers) {
    r -= weights[t];
    if (r < 0) return t;
  }
  // 부동소수점 오차로 끝까지 왔을 때의 안전망.
  return tiers[tiers.length - 1];
}

/**
 * 한 등급 안에서 카드 한 장을 고른다 — **미보유 카드에 가중치를 준다.**
 *
 * 이게 없으면 도감 후반부는 사실상 벽이다. 사파이어만 229종이라, 200장을
 * 모은 뒤에는 열 장을 뽑아도 새 카드가 한 장 나올까 말까 한다.
 */
function pickCard(
  tier: RarityTier,
  owned: Readonly<Record<string, number>>,
  exclude: ReadonlySet<string>,
  rng: Rng,
): string | null {
  const pool = POOL_BY_RARITY[tier].filter((c) => !exclude.has(c.id));
  if (pool.length === 0) return null;

  let total = 0;
  for (const c of pool) total += owned[c.id] ? 1 : NEW_CARD_WEIGHT;

  let r = rng() * total;
  for (const c of pool) {
    r -= owned[c.id] ? 1 : NEW_CARD_WEIGHT;
    if (r < 0) return c.id;
  }
  return pool[pool.length - 1].id;
}

/** 해당 등급 이상에서 한 장을 고른다(천장 보정용). 없으면 null. */
function pickAtLeast(
  min: RarityTier,
  owned: Readonly<Record<string, number>>,
  exclude: ReadonlySet<string>,
  rng: Rng,
): string | null {
  const tiers = RARITY_ORDER.filter((t) => RARITY_RANK[t] >= RARITY_RANK[min]);
  // 상위 등급을 먼저 시도하지 않고, 가중치대로 고른 뒤 비면 다음 후보로 넘어간다.
  // 보정으로 올라온 자리도 등급 사이 비율은 평소와 같아야 한다 — 보정이
  // 곧 '전설 확정'이 되어 버리면 확률표가 무의미해진다.
  const first = pickTier(tiers, DRAW_WEIGHTS, rng);
  const order = [first, ...tiers.filter((t) => t !== first)];
  for (const t of order) {
    const id = pickCard(t, owned, exclude, rng);
    if (id) return id;
  }
  return null;
}

// ── 팩 개봉 ─────────────────────────────────────────────────────────────

/**
 * 팩 하나를 연다. 순수 함수 — 소유 상태를 바꾸지 않고 결과만 돌려준다.
 *
 * 보장하는 것:
 *  - 한 팩 안에 **같은 카드는 두 번 나오지 않는다**(예전엔 나올 수 있었다).
 *  - 에메랄드 이상이 최소 한 장.
 *  - `PITY_EPIC` 팩마다 루비 이상이 최소 한 장.
 *  - `PITY_LEGENDARY_HARD` 팩 안에 다이아몬드 최소 한 장(그 전부터 확률이 오른다).
 *  - 중복은 등급에 따라 조각으로 환산된다.
 */
export function openPack(
  owned: Readonly<Record<string, number>>,
  pity: PityState,
  rng: Rng,
  size: number = PACK_SIZE,
): PackResult {
  const weights = weightsWithPity(pity);
  const picked: string[] = [];
  const seen = new Set<string>();

  const take = (id: string | null) => {
    if (!id || seen.has(id)) return false;
    seen.add(id);
    picked.push(id);
    return true;
  };

  // 1) 기본 뽑기 — 중복이 나오면 다시 뽑는다(무한루프 방지 상한).
  let guard = 0;
  while (picked.length < size && guard < size * 40) {
    guard += 1;
    take(pickCard(pickTier(RARITY_ORDER, weights, rng), owned, seen, rng));
  }

  // 2) 천장 보정 — 부족한 등급이 있으면 이미 뽑힌 카드 중 가장 낮은 것을 교체한다.
  //    교체 대상을 '가장 낮은 등급'으로 고르는 이유: 애써 나온 상위 등급을
  //    천장이 지우는 어이없는 일이 생기지 않게 하려고.
  const bestRank = () => picked.reduce((m, id) => Math.max(m, rankOf(id)), -1);

  const ensure = (min: RarityTier) => {
    if (bestRank() >= RARITY_RANK[min]) return;
    const worst = picked.reduce((lo, id, i) => (rankOf(id) < rankOf(picked[lo]) ? i : lo), 0);
    const without = new Set(seen);
    without.delete(picked[worst]);
    const id = pickAtLeast(min, owned, without, rng);
    if (!id) return;
    seen.delete(picked[worst]);
    seen.add(id);
    picked[worst] = id;
  };

  // 낮은 보장부터 적용한다 — 높은 보장이 나중에 덮어써야 하므로.
  ensure('rare');
  if (pity.sinceEpic + 1 >= PITY_EPIC) ensure('epic');
  if (pity.sinceLegendary + 1 >= PITY_LEGENDARY_HARD) ensure('legendary');

  // 3) 결과 정리 — 신규/중복을 가르고 중복은 조각으로.
  const results: DrawResult[] = [];
  const gained = new Set<string>();
  let shards = 0;
  for (const id of picked) {
    const isNew = !owned[id] && !gained.has(id);
    const s = isNew ? 0 : SHARD_REWARD[tierOf(id)];
    shards += s;
    if (isNew) gained.add(id);
    results.push({ id, isNew, shards: s });
  }

  // 4) 천장 상태 갱신.
  const top = bestRank();
  const next: PityState = {
    sinceEpic: top >= RARITY_RANK.epic ? 0 : pity.sinceEpic + 1,
    sinceLegendary: top >= RARITY_RANK.legendary ? 0 : pity.sinceLegendary + 1,
  };

  return { results, shards, pity: next };
}

// ── 조각 교환 ───────────────────────────────────────────────────────────

export interface ExchangeCheck {
  ok: boolean;
  price: number;
  reason?: '이미 보유한 카드예요' | '조각이 모자라요' | '없는 카드예요';
}

/**
 * 조각으로 특정 카드를 교환할 수 있는지 확인한다.
 * 이미 가진 카드는 살 수 없다 — 조각은 '도감을 채우는' 수단이지 중복을 늘리는
 * 수단이 아니다.
 */
export function canExchange(id: string, owned: Readonly<Record<string, number>>, shards: number): ExchangeCheck {
  const tier = TIER_BY_ID[id];
  if (!tier) return { ok: false, price: 0, reason: '없는 카드예요' };
  const price = SHARD_PRICE[tier];
  if (owned[id]) return { ok: false, price, reason: '이미 보유한 카드예요' };
  if (shards < price) return { ok: false, price, reason: '조각이 모자라요' };
  return { ok: true, price };
}

// ── 내부 조회 헬퍼 ──────────────────────────────────────────────────────

const TIER_BY_ID: Record<string, RarityTier> = (() => {
  const m: Record<string, RarityTier> = {};
  for (const t of RARITY_ORDER) for (const c of POOL_BY_RARITY[t]) m[c.id] = t;
  return m;
})();

function tierOf(id: string): RarityTier {
  return TIER_BY_ID[id] ?? 'common';
}

function rankOf(id: string): number {
  return RARITY_RANK[tierOf(id)];
}
