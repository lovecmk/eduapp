// 수집가 등급 — 닉네임 옆 뱃지가 무엇을 뜻하는지 정하는 규칙.
//
// ── 왜 '보유한 최고 등급'이 아닌가 ──────────────────────────────────────
// 예전 뱃지는 "가진 카드 중 가장 높은 등급"이었다. 도감이 150종이던
// 시절에도 느슨했지만, 지금은 아예 뜻이 없다 — 천장(PITY_LEGENDARY_HARD)
// 때문에 **60팩 안에 누구나 다이아몬드를 받는다.** 한 달만 쓰면 전원이
// '수호신 수집가'가 되는 뱃지는 아무것도 알려주지 않는다.
//
// 그래서 기준을 **수집률**로 바꿨다. 운이 아니라 쌓인 시간을 보여주는 값이고,
// 500종이라는 규모에서만 의미가 생기는 지표다.
import { RARITY_ORDER, type RarityTier } from '../utils/rarity';

/** 등급별 최소 수집률(0~1). 낮은 등급부터 오름차순. */
export const COLLECTOR_THRESHOLDS: Record<RarityTier, number> = {
  common: 0,      // 한 장이라도 모으면 시작
  rare: 0.25,     // 125종
  epic: 0.5,      // 250종
  legendary: 0.8, // 400종
};

/**
 * 수집률로 수집가 등급을 정한다.
 * 한 장도 없으면 null — 뱃지를 아예 달지 않는다.
 */
export function collectorTier(collected: number, total: number): RarityTier | null {
  if (collected <= 0 || total <= 0) return null;
  const pct = collected / total;
  let best: RarityTier = 'common';
  for (const t of RARITY_ORDER) {
    if (pct >= COLLECTOR_THRESHOLDS[t]) best = t;
  }
  return best;
}

/** 다음 등급까지 몇 종이 남았는지. 최고 등급이면 null. */
export function cardsToNextTier(collected: number, total: number): { tier: RarityTier; remaining: number } | null {
  const current = collectorTier(collected, total);
  const startIdx = current === null ? 0 : RARITY_ORDER.indexOf(current) + 1;
  const next = RARITY_ORDER[startIdx];
  if (!next) return null;
  const need = Math.ceil(COLLECTOR_THRESHOLDS[next] * total);
  return { tier: next, remaining: Math.max(0, need - collected) };
}
