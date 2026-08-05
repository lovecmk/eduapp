// 수집형 안전 카드 카탈로그 — 포켓몬/유희왕st '안전 도감'.
// 학습으로 카드팩을 모아 열고, 등급(희소도)이 높은 카드를 수집하는 재미 요소.
// 등급은 랩드 카드와 동일한 RarityTier 를 공유해 색/연출을 재사용한다.
//
// 카드 500종은 분야별로 나뉘어 있다(각 100종):
//   catalog.electric / catalog.process / catalog.hazmat / catalog.site / catalog.common
// 이 파일은 그것들을 합쳐 도감 전체와 뽑기 확률표를 노출한다.
import type { RarityTier } from '../../utils/rarity';
import { RARITY_ORDER } from '../../utils/rarity';
import { ELECTRIC } from './catalog.electric';
import { PROCESS } from './catalog.process';
import { HAZMAT } from './catalog.hazmat';
import { SITE } from './catalog.site';
import { COMMON_FIELD } from './catalog.common';
import type { Collectible } from './types';

export type { JewelTier, Collectible, CollectibleCategory } from './types';
export { JEWEL_META, JEWEL_ORDER } from './types';

/** 안전 카드 도감 전체(500종). */
export const COLLECTIBLES: Collectible[] = [...ELECTRIC, ...PROCESS, ...HAZMAT, ...SITE, ...COMMON_FIELD];

export const COLLECTIBLE_BY_ID: Record<string, Collectible> = Object.fromEntries(COLLECTIBLES.map((c) => [c.id, c]));

/** 등급별 카드 목록 — 뽑기가 매번 filter 를 돌지 않도록 한 번만 만든다. */
export const POOL_BY_RARITY: Record<RarityTier, Collectible[]> = {
  common: COLLECTIBLES.filter((c) => c.rarity === 'common'),
  rare: COLLECTIBLES.filter((c) => c.rarity === 'rare'),
  epic: COLLECTIBLES.filter((c) => c.rarity === 'epic'),
  legendary: COLLECTIBLES.filter((c) => c.rarity === 'legendary'),
};

// ── 뽑기 등급 가중치 ─────────────────────────────────────────────────────
// 합은 1.0 이어야 한다(테스트가 잠근다).
//
// 왜 이 숫자인가 — 도감이 150종에서 500종으로 커지면 **같은 가중치라도 체감이
// 달라진다.** 등급 안에서 카드가 늘어난 만큼 '그 한 장'이 나올 확률은 줄기
// 때문이다. 그래서 세 가지를 함께 설계했다:
//
//   1) 등급 확률(여기) — 팩을 열 때의 '두근거림'을 정한다.
//   2) 미보유 가중(packDraw.NEW_CARD_WEIGHT) — 이미 가진 카드보다 새 카드를
//      더 자주 뽑아, 500종이라도 수집이 끝나긴 하게 만든다.
//   3) 천장(packDraw.PITY_*) — 운이 나빠도 정해진 팩 수 안에 상위 등급이 나온다.
//
// 등급별 한 장당 확률(=가중치/풀 크기)은 대략 이렇다:
//   사파이어 0.24% · 에메랄드 0.18% · 루비 0.14% · 다이아몬드 0.12%
// 상위 등급일수록 한 장당 확률이 낮아 '희소'가 유지된다.
export const DRAW_WEIGHTS: Record<RarityTier, number> = { common: 0.56, rare: 0.3, epic: 0.11, legendary: 0.03 };

/** 한 팩에서 뽑는 카드 수. */
export const PACK_SIZE = 4;

/**
 * 도감 규모 요약 — 화면(진행도 배너)과 테스트가 함께 쓴다.
 * 카탈로그를 늘려도 이 값들은 자동으로 따라온다.
 */
export const CATALOG_STATS = {
  total: COLLECTIBLES.length,
  byRarity: Object.fromEntries(RARITY_ORDER.map((t) => [t, POOL_BY_RARITY[t].length])) as Record<RarityTier, number>,
};
