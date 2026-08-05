// 뽑기 규칙 검사 — 확률은 '느낌'으로 두면 안 되는 값이라 숫자로 잠근다.
import {
  openPack,
  seededRng,
  weightsWithPity,
  canExchange,
  INITIAL_PITY,
  NEW_CARD_WEIGHT,
  PITY_EPIC,
  PITY_LEGENDARY_HARD,
  PITY_LEGENDARY_SOFT,
  SHARD_PRICE,
  SHARD_REWARD,
  type PityState,
} from '../packDraw';
import { COLLECTIBLES, COLLECTIBLE_BY_ID, DRAW_WEIGHTS, PACK_SIZE, CATALOG_STATS, POOL_BY_RARITY } from '../../data/collectibles';
import { RARITY_ORDER, RARITY_RANK } from '../../utils/rarity';

/** 팩을 n번 연 결과를 누적한다(실제 스토어가 하는 일과 같은 순서). */
function openMany(n: number, seed = 1) {
  const rng = seededRng(seed);
  const owned: Record<string, number> = {};
  let pity: PityState = INITIAL_PITY;
  const packs: ReturnType<typeof openPack>[] = [];
  let shards = 0;
  for (let i = 0; i < n; i++) {
    const res = openPack(owned, pity, rng);
    for (const r of res.results) owned[r.id] = (owned[r.id] ?? 0) + 1;
    shards += res.shards;
    pity = res.pity;
    packs.push(res);
  }
  return { owned, pity, packs, shards };
}

const rarityOf = (id: string) => COLLECTIBLE_BY_ID[id].rarity;
const topRank = (ids: string[]) => Math.max(...ids.map((id) => RARITY_RANK[rarityOf(id)]));

describe('도감 카탈로그', () => {
  it('500종이고 id가 겹치지 않는다', () => {
    expect(CATALOG_STATS.total).toBe(500);
    expect(new Set(COLLECTIBLES.map((c) => c.id)).size).toBe(500);
  });

  it('등급 분포가 아래로 갈수록 넓다(피라미드)', () => {
    const { common, rare, epic, legendary } = CATALOG_STATS.byRarity;
    expect(common).toBeGreaterThan(rare);
    expect(rare).toBeGreaterThan(epic);
    expect(epic).toBeGreaterThan(legendary);
    expect(common + rare + epic + legendary).toBe(500);
  });

  it('분야 5종이 고르게 나뉜다', () => {
    const byCat = new Map<string, number>();
    for (const c of COLLECTIBLES) byCat.set(c.category, (byCat.get(c.category) ?? 0) + 1);
    expect(byCat.size).toBe(5);
    for (const n of byCat.values()) expect(n).toBe(100);
  });

  it('모든 카드가 이름·설명·안전상식을 갖는다', () => {
    for (const c of COLLECTIBLES) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.tagline.length).toBeGreaterThan(0);
      expect(c.tip.length).toBeGreaterThan(0);
      expect(c.power).toBeGreaterThan(0);
    }
  });

  it('파워가 등급대와 어긋나지 않는다', () => {
    // 상위 등급의 최소 파워가 하위 등급의 최대 파워보다 커야 '강한 카드'라는 감각이 산다.
    const range = (t: (typeof RARITY_ORDER)[number]) => {
      const ps = POOL_BY_RARITY[t].map((c) => c.power);
      return { min: Math.min(...ps), max: Math.max(...ps) };
    };
    for (let i = 1; i < RARITY_ORDER.length; i++) {
      expect(range(RARITY_ORDER[i]).min).toBeGreaterThan(range(RARITY_ORDER[i - 1]).max);
    }
  });

  it('등급 가중치의 합이 정확히 1이다', () => {
    const sum = RARITY_ORDER.reduce((s, t) => s + DRAW_WEIGHTS[t], 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('한 장당 확률은 상위 등급일수록 낮다', () => {
    // 풀이 커지면 등급 가중치만으로는 '희소함'이 보장되지 않는다 —
    // 가중치/풀크기(=한 장당 확률)가 단조 감소하는지가 진짜 조건이다.
    const per = RARITY_ORDER.map((t) => DRAW_WEIGHTS[t] / CATALOG_STATS.byRarity[t]);
    for (let i = 1; i < per.length; i++) expect(per[i]).toBeLessThan(per[i - 1]);
  });
});

describe('팩 개봉', () => {
  it('항상 PACK_SIZE 장이 나온다', () => {
    const { packs } = openMany(50, 7);
    for (const p of packs) expect(p.results).toHaveLength(PACK_SIZE);
  });

  it('한 팩 안에서 같은 카드가 두 번 나오지 않는다', () => {
    const { packs } = openMany(300, 12);
    for (const p of packs) {
      const ids = p.results.map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('모든 팩에 에메랄드 이상이 최소 한 장 들어 있다', () => {
    const { packs } = openMany(300, 3);
    for (const p of packs) expect(topRank(p.results.map((r) => r.id))).toBeGreaterThanOrEqual(RARITY_RANK.rare);
  });

  it(`루비 이상이 ${PITY_EPIC}팩 넘게 끊기지 않는다`, () => {
    const { packs } = openMany(600, 5);
    let gap = 0;
    for (const p of packs) {
      const has = p.results.some((r) => RARITY_RANK[rarityOf(r.id)] >= RARITY_RANK.epic);
      gap = has ? 0 : gap + 1;
      expect(gap).toBeLessThan(PITY_EPIC);
    }
  });

  it(`다이아몬드가 ${PITY_LEGENDARY_HARD}팩 넘게 끊기지 않는다`, () => {
    const { packs } = openMany(800, 9);
    let gap = 0;
    for (const p of packs) {
      const has = p.results.some((r) => rarityOf(r.id) === 'legendary');
      gap = has ? 0 : gap + 1;
      expect(gap).toBeLessThan(PITY_LEGENDARY_HARD);
    }
  });

  it('천장 상태는 상위 등급이 나오면 0으로 돌아간다', () => {
    const { packs } = openMany(200, 21);
    for (const p of packs) {
      const top = topRank(p.results.map((r) => r.id));
      if (top >= RARITY_RANK.legendary) expect(p.pity.sinceLegendary).toBe(0);
      if (top >= RARITY_RANK.epic) expect(p.pity.sinceEpic).toBe(0);
    }
  });
});

describe('실제로 뽑히는 등급 분포', () => {
  // 확률표를 적어두는 것과 그대로 나오는 것은 다른 문제다.
  //
  // 실제로 여기서 버그를 하나 잡았다: 천장 보정이 상위 등급만 담은 '부분'
  // 가중치를 넘기는 바람에 합계가 NaN 이 되어 **보정이 걸릴 때마다 무조건
  // 다이아몬드**가 나왔다. 팩당 보장("에메랄드 이상 1장")은 그래도 통과했기
  // 때문에 다른 테스트로는 드러나지 않았다. 분포를 직접 재야만 보인다.
  it('바닥 규칙까지 반영한 기대 분포와 실측이 맞는다', () => {
    // 미보유 가중과 천장이 섞이지 않도록 전부 보유한 상태로 잰다.
    const owned: Record<string, number> = {};
    for (const c of COLLECTIBLES) owned[c.id] = 1;

    const rng = seededRng(4242);
    const count: Record<string, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
    let pity: PityState = INITIAL_PITY;
    let cards = 0;
    for (let i = 0; i < 5000; i++) {
      const res = openPack(owned, pity, rng);
      pity = res.pity;
      for (const r of res.results) { count[rarityOf(r.id)] += 1; cards += 1; }
    }

    // 기대값은 확률표 그대로가 아니다 — "팩당 에메랄드 이상 1장" 바닥 규칙이
    // 사파이어 몫을 조금 위로 옮긴다. 그 이동량까지 계산해서 비교해야
    // '거의 맞다'가 아니라 '정확히 이래야 한다'를 잠글 수 있다.
    const allCommon = DRAW_WEIGHTS.common ** PACK_SIZE; // 네 장이 모두 사파이어일 확률
    const moved = allCommon / PACK_SIZE;                // 그중 한 장이 위로 교체된다
    const upper = DRAW_WEIGHTS.rare + DRAW_WEIGHTS.epic + DRAW_WEIGHTS.legendary;
    const expected: Record<string, number> = {
      common: DRAW_WEIGHTS.common - moved,
      rare: DRAW_WEIGHTS.rare + (moved * DRAW_WEIGHTS.rare) / upper,
      epic: DRAW_WEIGHTS.epic + (moved * DRAW_WEIGHTS.epic) / upper,
      legendary: DRAW_WEIGHTS.legendary + (moved * DRAW_WEIGHTS.legendary) / upper,
    };

    for (const t of RARITY_ORDER) {
      expect(Math.abs(count[t] / cards - expected[t])).toBeLessThan(0.008);
    }
  });

  it('다이아몬드는 보장 규칙 때문에 부풀지 않는다', () => {
    const owned: Record<string, number> = {};
    for (const c of COLLECTIBLES) owned[c.id] = 1;
    const rng = seededRng(31337);
    let pity: PityState = INITIAL_PITY;
    let leg = 0;
    let cards = 0;
    for (let i = 0; i < 5000; i++) {
      const res = openPack(owned, pity, rng);
      pity = res.pity;
      for (const r of res.results) { if (rarityOf(r.id) === 'legendary') leg += 1; cards += 1; }
    }
    // 기본 확률의 1.5배를 넘으면 어딘가에서 전설을 공짜로 주고 있다는 뜻.
    expect(leg / cards).toBeLessThan(DRAW_WEIGHTS.legendary * 1.5);
  });
});

describe('소프트 천장', () => {
  it('소프트 천장 전에는 기본 확률 그대로다', () => {
    const w = weightsWithPity({ sinceEpic: 0, sinceLegendary: PITY_LEGENDARY_SOFT });
    expect(w.legendary).toBeCloseTo(DRAW_WEIGHTS.legendary, 10);
  });

  it('소프트 천장을 지나면 다이아몬드 확률이 오른다', () => {
    const a = weightsWithPity({ sinceEpic: 0, sinceLegendary: PITY_LEGENDARY_SOFT + 1 });
    const b = weightsWithPity({ sinceEpic: 0, sinceLegendary: PITY_LEGENDARY_SOFT + 10 });
    expect(a.legendary).toBeGreaterThan(DRAW_WEIGHTS.legendary);
    expect(b.legendary).toBeGreaterThan(a.legendary);
  });

  it('올라간 몫은 사파이어에서 가져오고 합은 1로 유지된다', () => {
    const w = weightsWithPity({ sinceEpic: 0, sinceLegendary: PITY_LEGENDARY_SOFT + 6 });
    expect(w.rare).toBe(DRAW_WEIGHTS.rare);
    expect(w.epic).toBe(DRAW_WEIGHTS.epic);
    expect(RARITY_ORDER.reduce((s, t) => s + w[t], 0)).toBeCloseTo(1, 10);
  });
});

describe('미보유 가중', () => {
  it('안 가진 카드가 가진 카드보다 잘 나온다', () => {
    // 사파이어 풀의 절반을 이미 가진 상태로 두고, 새로 나온 카드가
    // 미보유 쪽에 얼마나 쏠리는지 본다.
    const pool = POOL_BY_RARITY.common;
    const owned: Record<string, number> = {};
    pool.slice(0, Math.floor(pool.length / 2)).forEach((c) => { owned[c.id] = 1; });

    const rng = seededRng(101);
    let newHit = 0;
    let oldHit = 0;
    for (let i = 0; i < 3000; i++) {
      const res = openPack(owned, INITIAL_PITY, rng);
      for (const r of res.results) {
        if (rarityOf(r.id) !== 'common') continue;
        if (owned[r.id]) oldHit += 1;
        else newHit += 1;
      }
    }
    // 반반 풀이므로 편향이 없으면 1:1. 가중치가 걸리면 대략 NEW_CARD_WEIGHT:1 에 가까워진다.
    const ratio = newHit / oldHit;
    expect(ratio).toBeGreaterThan(NEW_CARD_WEIGHT * 0.7);
    expect(ratio).toBeLessThan(NEW_CARD_WEIGHT * 1.3);
  });

  it('500종이라도 꾸준히 열면 도감이 채워진다', () => {
    // 미보유 가중이 없으면 이 수치는 훨씬 낮게 정체한다 —
    // '수집이 끝나긴 한다'를 보증하는 회귀 테스트다.
    const { owned } = openMany(400, 77);
    expect(Object.keys(owned).length).toBeGreaterThan(300);
  });
});

describe('중복 → 조각', () => {
  it('신규 카드는 조각을 주지 않는다', () => {
    const { packs } = openMany(100, 31);
    for (const p of packs) for (const r of p.results) if (r.isNew) expect(r.shards).toBe(0);
  });

  it('중복 카드는 등급에 맞는 조각을 준다', () => {
    const { packs } = openMany(400, 44);
    let dupes = 0;
    for (const p of packs) {
      for (const r of p.results) {
        if (r.isNew) continue;
        dupes += 1;
        expect(r.shards).toBe(SHARD_REWARD[rarityOf(r.id)]);
      }
    }
    expect(dupes).toBeGreaterThan(0);
  });

  it('팩의 조각 합계가 카드별 조각의 합과 같다', () => {
    const { packs } = openMany(120, 55);
    for (const p of packs) {
      expect(p.shards).toBe(p.results.reduce((s, r) => s + r.shards, 0));
    }
  });

  it('상위 등급 중복일수록 조각을 많이 준다', () => {
    for (let i = 1; i < RARITY_ORDER.length; i++) {
      expect(SHARD_REWARD[RARITY_ORDER[i]]).toBeGreaterThan(SHARD_REWARD[RARITY_ORDER[i - 1]]);
      expect(SHARD_PRICE[RARITY_ORDER[i]]).toBeGreaterThan(SHARD_PRICE[RARITY_ORDER[i - 1]]);
    }
  });

  it('교환가는 중복 보상보다 훨씬 비싸다(조각이 뽑기를 대체하지 않게)', () => {
    for (const t of RARITY_ORDER) {
      expect(SHARD_PRICE[t]).toBeGreaterThan(SHARD_REWARD[t] * 10);
    }
  });
});

describe('조각 교환', () => {
  const anyRare = POOL_BY_RARITY.rare[0].id;

  it('조각이 충분하고 미보유면 교환할 수 있다', () => {
    expect(canExchange(anyRare, {}, SHARD_PRICE.rare)).toEqual({ ok: true, price: SHARD_PRICE.rare });
  });

  it('조각이 모자라면 막는다', () => {
    const r = canExchange(anyRare, {}, SHARD_PRICE.rare - 1);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('조각이 모자라요');
  });

  it('이미 가진 카드는 살 수 없다(중복을 돈 주고 늘리지 않게)', () => {
    const r = canExchange(anyRare, { [anyRare]: 1 }, 99999);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('이미 보유한 카드예요');
  });

  it('없는 id는 거절한다', () => {
    expect(canExchange('없는카드', {}, 99999).ok).toBe(false);
  });
});

describe('시드 난수', () => {
  it('같은 시드는 같은 결과를 준다(재현 가능)', () => {
    const a = openPack({}, INITIAL_PITY, seededRng(2024));
    const b = openPack({}, INITIAL_PITY, seededRng(2024));
    expect(a.results.map((r) => r.id)).toEqual(b.results.map((r) => r.id));
  });

  it('다른 시드는 다른 결과를 준다', () => {
    const a = openPack({}, INITIAL_PITY, seededRng(1));
    const b = openPack({}, INITIAL_PITY, seededRng(2));
    expect(a.results.map((r) => r.id)).not.toEqual(b.results.map((r) => r.id));
  });
});
