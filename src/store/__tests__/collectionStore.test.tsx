// AsyncStorage(RN 모듈)에 의존하므로 components 프로젝트(jest-expo)에서 돌린다.
// 수집 스토어 검사 — 특히 '보상 지급'은 스토어 밖에서 지시할 수 없어야 한다.
import { useCollectionStore, STUDY_PER_PACK, DAILY_PACK_MIN_STUDY, INITIAL_PACKS } from '../collectionStore';
import { EMPTY_CONTEXT, PACK_RULE_BY_ID, type PackRuleContext } from '../../data/packRules';
import { SHARD_PRICE } from '../../domain/packDraw';
import { POOL_BY_RARITY } from '../../data/collectibles';

const store = () => useCollectionStore.getState();
const ctx = (over: Partial<PackRuleContext> = {}): PackRuleContext => ({ ...EMPTY_CONTEXT, ...over });

beforeEach(() => {
  store().reset();
});

describe('학습 적립', () => {
  it(`${STUDY_PER_PACK}장 학습마다 팩이 하나 늘어난다`, () => {
    const before = store().packs;
    for (let i = 0; i < STUDY_PER_PACK - 1; i++) store().addStudyProgress();
    expect(store().packs).toBe(before);
    store().addStudyProgress();
    expect(store().packs).toBe(before + 1);
  });

  it('한 번에 여러 장을 마쳐도 장수만큼 적립된다', () => {
    // 세션이 끝날 때 doneCount 를 한꺼번에 넘긴다 — 낱장으로 나눠 부른 것과
    // 결과가 같아야 한다(적립 단위가 '세션'이 아니라 '장'이라는 뜻).
    const before = store().packs;
    store().addStudyProgress(STUDY_PER_PACK * 2 + 1);
    expect(store().packs).toBe(before + 2);
    expect(store().studyProgress).toBe(1);
  });

  it('0장은 아무것도 바꾸지 않는다', () => {
    const before = { ...store() };
    store().addStudyProgress(0);
    expect(store().packs).toBe(before.packs);
    expect(store().dailyStatus().studied).toBe(0);
  });

  it('오늘 학습한 장수를 따로 센다', () => {
    store().addStudyProgress(2);
    store().addStudyProgress();
    expect(store().dailyStatus().studied).toBe(3);
  });
});

describe('일일 무료팩', () => {
  it('학습을 안 하면 열리지 않는다', () => {
    // 예전엔 앱을 열기만 해도 매일 팩이 나왔다 — 학습 앱의 보상인데
    // 학습과 무관했던 지점이라 조건을 걸었다.
    expect(store().dailyStatus().canClaim).toBe(false);
    expect(store().claimDaily()).toBe(false);
    expect(store().packs).toBe(INITIAL_PACKS);
  });

  it(`오늘 ${DAILY_PACK_MIN_STUDY}장을 학습하면 열린다`, () => {
    for (let i = 0; i < DAILY_PACK_MIN_STUDY; i++) store().addStudyProgress();
    expect(store().dailyStatus().canClaim).toBe(true);
    expect(store().claimDaily()).toBe(true);
  });

  it('하루에 두 번은 못 받는다', () => {
    for (let i = 0; i < DAILY_PACK_MIN_STUDY; i++) store().addStudyProgress();
    expect(store().claimDaily()).toBe(true);
    expect(store().claimDaily()).toBe(false);
  });
});

describe('규칙 보상 — 화면이 금액을 정하지 못한다', () => {
  it('조건을 못 채웠으면 아무것도 주지 않는다', () => {
    const before = store().packs;
    expect(store().claimRule('study-10', ctx({ studyTotal: 9 }))).toBe(0);
    expect(store().packs).toBe(before);
  });

  it('조건을 채우면 규칙에 적힌 만큼만 준다', () => {
    const before = store().packs;
    const reward = PACK_RULE_BY_ID['study-10'].reward;
    expect(store().claimRule('study-10', ctx({ studyTotal: 10 }))).toBe(reward);
    expect(store().packs).toBe(before + reward);
  });

  it('같은 규칙을 연속으로 눌러도 두 번 지급되지 않는다', () => {
    // 화면이 낡은 값을 들고 버튼을 두 번 눌러도 스토어가 재평가해서 막는다.
    const c = ctx({ studyTotal: 10 });
    const first = store().claimRule('study-10', c);
    const second = store().claimRule('study-10', c);
    expect(first).toBeGreaterThan(0);
    expect(second).toBe(0);
  });

  it('모르는 규칙 id는 무시한다', () => {
    const before = store().packs;
    expect(store().claimRule('made-up-rule', ctx({ studyTotal: 99999 }))).toBe(0);
    expect(store().packs).toBe(before);
  });

  it('반복 규칙도 상한을 넘겨 지급하지 않는다', () => {
    const rule = PACK_RULE_BY_ID['study-50'];
    const max = rule.maxTimes!;
    const huge = ctx({ studyTotal: rule.target * max * 3 });
    const before = store().packs;
    store().claimRule('study-50', huge);
    store().claimRule('study-50', huge);
    expect(store().packs - before).toBe(rule.reward * max);
  });
});

describe('팩 개봉과 조각', () => {
  it('팩이 없으면 열리지 않는다', () => {
    useCollectionStore.setState({ packs: 0 });
    expect(store().openPack()).toBeNull();
  });

  it('열면 팩이 하나 줄고 도감이 늘어난다', () => {
    const before = store().packs;
    const res = store().openPack();
    expect(res).not.toBeNull();
    expect(store().packs).toBe(before - 1);
    expect(Object.keys(store().owned).length).toBeGreaterThan(0);
  });

  it('중복이 쌓이면 조각이 늘어난다', () => {
    useCollectionStore.setState({ packs: 200 });
    for (let i = 0; i < 200; i++) store().openPack();
    expect(store().shards).toBeGreaterThan(0);
  });
});

describe('조각 교환', () => {
  const target = POOL_BY_RARITY.rare[0].id;

  it('조각이 모자라면 교환되지 않는다', () => {
    useCollectionStore.setState({ shards: SHARD_PRICE.rare - 1 });
    expect(store().exchangeShards(target)).toBe(false);
    expect(store().owned[target]).toBeUndefined();
  });

  it('교환하면 조각이 빠지고 카드가 들어온다', () => {
    useCollectionStore.setState({ shards: SHARD_PRICE.rare });
    expect(store().exchangeShards(target)).toBe(true);
    expect(store().owned[target]).toBe(1);
    expect(store().shards).toBe(0);
    expect(store().newIds).toContain(target);
  });

  it('이미 가진 카드는 조각으로 살 수 없다', () => {
    useCollectionStore.setState({ shards: 99999, owned: { [target]: 1 } });
    expect(store().exchangeShards(target)).toBe(false);
    expect(store().shards).toBe(99999);
  });
});

describe('초기화', () => {
  it('모든 상태가 첫 방문으로 돌아간다', () => {
    useCollectionStore.setState({ packs: 99, shards: 500, owned: { x: 3 }, claimedRules: { 'study-10': 1 } });
    store().reset();
    expect(store().packs).toBe(INITIAL_PACKS);
    expect(store().shards).toBe(0);
    expect(store().owned).toEqual({});
    expect(store().claimedRules).toEqual({});
    expect(store().pity).toEqual({ sinceEpic: 0, sinceLegendary: 0 });
  });
});
