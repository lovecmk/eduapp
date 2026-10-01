import {
  BUILDING_CRATES,
  crateKey,
  describeContents,
  evaluateCrates,
  monthBricks,
  monthKey,
  openedCrateCount,
  rollCrate,
  CRATE_BY_FLOOR,
} from '../buildingCrates';

const M = '2026-10';
const stateOf = (floors: number, myBricks: number, claimed: Record<string, number> = {}) =>
  Object.fromEntries(evaluateCrates({ month: M, floors, myBricks, claimed }).map((s) => [s.crate.floor, s.state]));

describe('옥상 보물상자 — 상태 판정', () => {
  it('빌딩이 그 층에 닿지 않았으면 잠겨 있다', () => {
    expect(stateOf(4, 999)[5]).toBe('locked');
  });

  it('층은 닿았어도 내 벽돌이 모자라면 열 수 없다 — 무임승차 금지', () => {
    const st = evaluateCrates({ month: M, floors: 12, myBricks: 3, claimed: {} });
    expect(st.find((s) => s.crate.floor === 5)?.state).toBe('ready');
    const ten = st.find((s) => s.crate.floor === 10)!;
    expect(ten.state).toBe('needBricks');
    expect(ten.bricksLeft).toBe(2);
  });

  it('이번 달에 연 상자는 opened, 지난 달 기록은 이번 달에 영향이 없다', () => {
    const s = stateOf(12, 50, { [crateKey(M, 5)]: 1, [crateKey('2026-09', 10)]: 1 });
    expect(s[5]).toBe('opened');
    expect(s[10]).toBe('ready');
  });

  it('층이 높을수록 요구 벽돌이 많고 보상이 크다(사다리)', () => {
    for (let i = 1; i < BUILDING_CRATES.length; i++) {
      expect(BUILDING_CRATES[i].floor).toBeGreaterThan(BUILDING_CRATES[i - 1].floor);
      expect(BUILDING_CRATES[i].bricks).toBeGreaterThan(BUILDING_CRATES[i - 1].bricks);
    }
  });
});

describe('내 벽돌 수', () => {
  it('학습 카운터와 이번 달 복습 기록 중 큰 값을 쓴다', () => {
    const now = new Date(2026, 9, 15);
    const month = monthKey(now);
    const srs = {
      a: { lastReviewedAt: new Date(2026, 9, 2).getTime() },
      b: { lastReviewedAt: new Date(2026, 9, 14).getTime() },
      c: { lastReviewedAt: new Date(2026, 8, 30).getTime() }, // 지난 달
      d: { lastReviewedAt: null },
    };
    expect(monthBricks(month, { monthStudy: 1, monthStudyKey: month }, srs)).toBe(2);
    expect(monthBricks(month, { monthStudy: 9, monthStudyKey: month }, srs)).toBe(9);
    // 카운터가 지난 달 값이면 0으로 본다
    expect(monthBricks(month, { monthStudy: 9, monthStudyKey: '2026-09' }, {})).toBe(0);
  });
});

describe('상자 내용물', () => {
  it('깜짝 상자는 1~3팩을 확률표대로 준다', () => {
    const surprise = BUILDING_CRATES.find((c) => c.surprise)!;
    expect(rollCrate(surprise, () => 0).packs).toBe(1);
    expect(rollCrate(surprise, () => 0.59).packs).toBe(1);
    expect(rollCrate(surprise, () => 0.6).packs).toBe(2);
    expect(rollCrate(surprise, () => 0.95).packs).toBe(3);
    expect(rollCrate(surprise, () => 0.99999).packs).toBe(3);
  });

  it('일반 상자는 정해진 만큼만', () => {
    expect(rollCrate(CRATE_BY_FLOOR[10], () => 0.99)).toEqual({ packs: 1, shards: 30 });
    expect(describeContents(CRATE_BY_FLOOR[10])).toBe('카드팩 1개 + 안전 조각 30');
    expect(describeContents(CRATE_BY_FLOOR[20])).toBe('카드팩 1~3개 (무작위)');
  });

  it('그 달에 연 상자 수를 센다', () => {
    expect(openedCrateCount(M, { [crateKey(M, 5)]: 1, [crateKey(M, 10)]: 1, 'study-50': 3 })).toBe(2);
    expect(openedCrateCount('2026-09', { [crateKey(M, 5)]: 1 })).toBe(0);
  });
});
