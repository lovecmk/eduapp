// AsyncStorage(RN 모듈)에 의존하므로 components 프로젝트(jest-expo)에서 돌린다.
// 수집 스토어 검사 — 특히 '보상 지급'은 스토어 밖에서 지시할 수 없어야 한다.
import { useCollectionStore, selectPacks, selectShards, STUDY_PER_PACK, DAILY_PACK_MIN_STUDY, INITIAL_PACKS } from '../collectionStore';
import { EMPTY_CONTEXT, PACK_RULE_BY_ID, type PackRuleContext } from '../../data/packRules';
import { SHARD_PRICE } from '../../domain/packDraw';
import { POOL_BY_RARITY } from '../../data/collectibles';

const store = () => useCollectionStore.getState();
/** 화면이 보는 잔액 — 저장은 카운터로 하고 잔액은 계산해서 쓴다. */
const packs = () => selectPacks(useCollectionStore.getState());
const shards = () => selectShards(useCollectionStore.getState());
const ctx = (over: Partial<PackRuleContext> = {}): PackRuleContext => ({ ...EMPTY_CONTEXT, ...over });

beforeEach(() => {
  store().reset();
});

describe('학습 적립', () => {
  it(`${STUDY_PER_PACK}장 학습마다 팩이 하나 늘어난다`, () => {
    const before = packs();
    for (let i = 0; i < STUDY_PER_PACK - 1; i++) store().addStudyProgress();
    expect(packs()).toBe(before);
    store().addStudyProgress();
    expect(packs()).toBe(before + 1);
  });

  it('한 번에 여러 장을 마쳐도 장수만큼 적립된다', () => {
    // 세션이 끝날 때 doneCount 를 한꺼번에 넘긴다 — 낱장으로 나눠 부른 것과
    // 결과가 같아야 한다(적립 단위가 '세션'이 아니라 '장'이라는 뜻).
    const before = packs();
    store().addStudyProgress(STUDY_PER_PACK * 2 + 1);
    expect(packs()).toBe(before + 2);
    expect(store().studyTotal % STUDY_PER_PACK).toBe(1);
  });

  it('0장은 아무것도 바꾸지 않는다', () => {
    const before = packs();
    store().addStudyProgress(0);
    expect(packs()).toBe(before);
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
    expect(packs()).toBe(INITIAL_PACKS);
  });

  it(`오늘 ${DAILY_PACK_MIN_STUDY}장을 학습하면 열린다`, () => {
    for (let i = 0; i < DAILY_PACK_MIN_STUDY; i++) store().addStudyProgress();
    expect(store().dailyStatus().canClaim).toBe(true);
    expect(store().claimDaily()).toBe(true);
  });

  /**
   * 학습 화면은 카드를 한 장 마칠 때마다 addStudyProgress(1) 을 부른다.
   *
   * 예전에는 완료 화면(finished)에서 한꺼번에 넣었다. 그러면 배정이 5장인 날
   * 3장만 하고 화면을 떠난 사람은 한 장도 인정받지 못하고, 도감에서는 방금
   * 세 장을 푼 사람에게 "오늘 3장을 학습하면 열려요 (0/3)" 이 보인다.
   */
  it('세션을 끝까지 마치지 않아도, 한 장씩 쌓은 학습으로 열린다', () => {
    for (let i = 0; i < DAILY_PACK_MIN_STUDY; i++) store().addStudyProgress(1);
    expect(store().dailyStatus().studied).toBe(DAILY_PACK_MIN_STUDY);
    expect(store().dailyStatus().canClaim).toBe(true);
  });

  it('하루에 두 번은 못 받는다', () => {
    for (let i = 0; i < DAILY_PACK_MIN_STUDY; i++) store().addStudyProgress();
    expect(store().claimDaily()).toBe(true);
    expect(store().claimDaily()).toBe(false);
  });
});

describe('규칙 보상 — 화면이 금액을 정하지 못한다', () => {
  it('조건을 못 채웠으면 아무것도 주지 않는다', () => {
    const before = packs();
    expect(store().claimRule('study-10', ctx({ studyTotal: 9 }))).toBe(0);
    expect(packs()).toBe(before);
  });

  it('조건을 채우면 규칙에 적힌 만큼만 준다', () => {
    const before = packs();
    const reward = PACK_RULE_BY_ID['study-10'].reward;
    expect(store().claimRule('study-10', ctx({ studyTotal: 10 }))).toBe(reward);
    expect(packs()).toBe(before + reward);
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
    const before = packs();
    expect(store().claimRule('made-up-rule', ctx({ studyTotal: 99999 }))).toBe(0);
    expect(packs()).toBe(before);
  });

  it('반복 규칙도 상한을 넘겨 지급하지 않는다', () => {
    const rule = PACK_RULE_BY_ID['study-50'];
    const max = rule.maxTimes!;
    const huge = ctx({ studyTotal: rule.target * max * 3 });
    const before = packs();
    store().claimRule('study-50', huge);
    store().claimRule('study-50', huge);
    expect(packs() - before).toBe(rule.reward * max);
  });
});

describe('팩 개봉과 조각', () => {
  it('팩이 없으면 열리지 않는다', () => {
    useCollectionStore.setState({ packsEarned: 0, packsOpened: 0 });
    expect(store().openPack()).toBeNull();
  });

  it('열면 팩이 하나 줄고 도감이 늘어난다', () => {
    const before = packs();
    const res = store().openPack();
    expect(res).not.toBeNull();
    expect(packs()).toBe(before - 1);
    expect(Object.keys(store().owned).length).toBeGreaterThan(0);
  });

  it('중복이 쌓이면 조각이 늘어난다', () => {
    useCollectionStore.setState({ packsEarned: 200, packsOpened: 0 });
    for (let i = 0; i < 200; i++) store().openPack();
    expect(shards()).toBeGreaterThan(0);
  });
});

describe('조각 교환', () => {
  const target = POOL_BY_RARITY.rare[0].id;

  it('조각이 모자라면 교환되지 않는다', () => {
    useCollectionStore.setState({ shardsEarned: SHARD_PRICE.rare - 1, shardsSpent: 0 });
    expect(store().exchangeShards(target)).toBe(false);
    expect(store().owned[target]).toBeUndefined();
  });

  it('교환하면 조각이 빠지고 카드가 들어온다', () => {
    useCollectionStore.setState({ shardsEarned: SHARD_PRICE.rare, shardsSpent: 0 });
    expect(store().exchangeShards(target)).toBe(true);
    expect(store().owned[target]).toBe(1);
    expect(shards()).toBe(0);
    expect(store().newIds).toContain(target);
  });

  it('이미 가진 카드는 조각으로 살 수 없다', () => {
    useCollectionStore.setState({ shardsEarned: 99999, shardsSpent: 0, owned: { [target]: 1 } });
    expect(store().exchangeShards(target)).toBe(false);
    expect(shards()).toBe(99999);
  });
});

describe('초기화', () => {
  it('모든 상태가 첫 방문으로 돌아간다', () => {
    useCollectionStore.setState({ packsEarned: 99, shardsEarned: 500, owned: { x: 3 }, claimedRules: { 'study-10': 1 } });
    store().reset();
    expect(packs()).toBe(INITIAL_PACKS);
    expect(shards()).toBe(0);
    expect(store().owned).toEqual({});
    expect(store().claimedRules).toEqual({});
    expect(store().sinceEpic).toBe(0);
    expect(store().sinceLegendary).toBe(0);
  });
});

describe('서버 동기화', () => {
  it('스냅샷에 잔액은 담기지 않는다', () => {
    // 잔액은 카운터에서 계산되는 값이라 보내 봐야 쓸 데가 없고,
    // 보내서 저장하면 카운터와 어긋나는 순간 어느 쪽이 진실인지 알 수 없다.
    const snap = store().snapshot() as unknown as Record<string, unknown>;
    expect(snap).not.toHaveProperty('packs');
    expect(snap).not.toHaveProperty('shards');
    expect(snap.packsEarned).toBe(INITIAL_PACKS);
    expect(snap.packsOpened).toBe(0);
  });

  it('화면 상태(todayStudy·newIds)는 보내지 않는다', () => {
    // 기기 로컬의 표시 상태라 서버에 올릴 것도, 남의 기기에 내려줄 것도 아니다.
    store().addStudyProgress(2);
    const snap = store().snapshot() as unknown as Record<string, unknown>;
    expect(snap).not.toHaveProperty('todayStudy');
    expect(snap).not.toHaveProperty('newIds');
  });

  it('서버 응답을 받아도 그 사이의 개봉이 사라지지 않는다', () => {
    // 요청이 오가는 몇 초 동안에도 사용자는 팩을 연다. 응답을 그대로
    // 덮어쓰면 그 개봉이 증발한다 — applyServer 는 한 번 더 합친다.
    useCollectionStore.setState({ packsEarned: 10, packsOpened: 2 });
    const sent = store().snapshot();

    store().openPack(); // 응답을 기다리는 사이에 한 개 더 열었다
    expect(store().packsOpened).toBe(3);

    // 서버는 '보낸 시점'의 상태를 병합해 돌려준다(개봉 2회).
    store().applyServer(sent);

    expect(store().packsOpened).toBe(3);
  });

  it('서버에만 있던 카드가 도감에 들어오고 NEW 로 뜬다', () => {
    // 기기를 바꾼 직후의 첫 동기화 — 예전 기기에서 모은 카드가 돌아온다.
    const target = POOL_BY_RARITY.epic[0].id;
    store().applyServer({
      ...store().snapshot(),
      owned: { [target]: 2 },
      packsEarned: 40,
      packsOpened: 30,
    });

    expect(store().owned[target]).toBe(2);
    expect(store().newIds).toContain(target);
    expect(packs()).toBe(10);
  });

  it('서버가 보낸 오래된 값이 내 기록을 되돌리지 못한다', () => {
    useCollectionStore.setState({ packsEarned: 50, packsOpened: 40, studyTotal: 300 });
    store().applyServer({ ...store().snapshot(), packsEarned: 2, packsOpened: 1, studyTotal: 5 });

    expect(store().packsEarned).toBe(50);
    expect(store().packsOpened).toBe(40);
    expect(store().studyTotal).toBe(300);
  });

  it('동기화 시각을 남긴다', () => {
    expect(store().lastSyncedAt).toBeNull();
    store().applyServer(store().snapshot());
    expect(store().lastSyncedAt).not.toBeNull();
  });
});

describe('저장 데이터 마이그레이션 (v3 → v4)', () => {
  // 이미 쓰고 있던 사용자의 저장 데이터를 그대로 흉내 낸다.
  // 잔액을 카운터로 바꾸는 변경이라, 여기서 틀리면 실사용자의 팩이 증발한다.
  const migrate = (useCollectionStore.persist.getOptions().migrate)!;

  it('v3 잔액이 그대로 보존된다', () => {
    const v3 = { packs: 7, shards: 250, owned: { elb: 2 }, pity: { sinceEpic: 3, sinceLegendary: 21 } };
    const out = migrate(v3, 3) as ReturnType<typeof store>;

    expect(selectPacks(out)).toBe(7);
    expect(selectShards(out)).toBe(250);
    // 개봉·사용 카운터는 0에서 시작한다(과거 횟수는 복원할 수 없다).
    expect(out.packsOpened).toBe(0);
    expect(out.shardsSpent).toBe(0);
  });

  it('보유 카드와 천장이 살아남는다', () => {
    const v3 = { packs: 1, shards: 0, owned: { elb: 2, goggles: 1 }, pity: { sinceEpic: 3, sinceLegendary: 21 } };
    const out = migrate(v3, 3) as ReturnType<typeof store>;

    expect(out.owned).toEqual({ elb: 2, goggles: 1 });
    expect(out.sinceEpic).toBe(3);
    expect(out.sinceLegendary).toBe(21);
  });

  it('옛 필드는 남지 않는다', () => {
    const out = migrate({ packs: 4, shards: 10, studyProgress: 2 }, 3) as unknown as Record<string, unknown>;
    expect(out).not.toHaveProperty('packs');
    expect(out).not.toHaveProperty('shards');
    expect(out).not.toHaveProperty('pity');
    expect(out).not.toHaveProperty('studyProgress');
  });

  it('저장된 것이 없으면 첫 방문 상태가 된다', () => {
    const out = migrate(undefined, 3) as ReturnType<typeof store>;
    expect(selectPacks(out)).toBe(INITIAL_PACKS);
  });

  it('v1 사용자도 v4 까지 한 번에 올라온다', () => {
    // v1 → v2 보너스 3팩이 적립 카운터로 들어가고, 그 뒤 단계도 적용된다.
    const out = migrate({ packs: 2, owned: {} }, 1) as ReturnType<typeof store>;
    expect(selectPacks(out)).toBe(5);
    expect(out.packsOpened).toBe(0);
  });
});
