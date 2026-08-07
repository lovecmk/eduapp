// 도감 병합 규칙 — 서버(service/collection_service.go)와 **같은 규칙**이어야 한다.
// 갈리면 앱이 계산한 값과 서버가 돌려준 값이 매 동기화마다 서로를 되돌린다.
import {
  EMPTY_SNAPSHOT,
  mergeSnapshots,
  packBalance,
  shardBalance,
  type CollectionSnapshot,
} from '../models/Collection';

const snap = (over: Partial<CollectionSnapshot> = {}): CollectionSnapshot => ({
  ...EMPTY_SNAPSHOT,
  ...over,
});

describe('잔액 계산', () => {
  it('잔액은 적립에서 사용을 뺀 값이다', () => {
    expect(packBalance({ packsEarned: 10, packsOpened: 7 })).toBe(3);
    expect(shardBalance({ shardsEarned: 300, shardsSpent: 90 })).toBe(210);
  });

  it('음수 잔액은 새어 나오지 않는다', () => {
    // 손상된 데이터가 들어와도 화면이 "-3팩"을 보여주지는 않게.
    expect(packBalance({ packsEarned: 1, packsOpened: 9 })).toBe(0);
    expect(shardBalance({ shardsEarned: 0, shardsSpent: 50 })).toBe(0);
  });
});

describe('병합', () => {
  // 이 테스트가 이 파일의 핵심 — 잔액을 그대로 동기화했다면 반드시 깨지는 시나리오.
  it('두 기기의 적립과 개봉이 모두 살아남는다', () => {
    const deviceA = snap({ packsEarned: 5, packsOpened: 3, owned: { 'safety-helmet': 2 } });
    const deviceB = snap({ packsEarned: 6, packsOpened: 4, owned: { 'safety-helmet': 1, extinguisher: 1 } });

    const merged = mergeSnapshots(deviceA, deviceB);

    expect(merged.packsEarned).toBe(6);
    expect(merged.packsOpened).toBe(4);
    // 카드는 카드별 최댓값 — A 의 2장이 B 의 1장에 덮이지 않는다.
    expect(merged.owned['safety-helmet']).toBe(2);
    expect(merged.owned.extinguisher).toBe(1);
  });

  it('순서를 바꿔도 결과가 같다(교환법칙)', () => {
    const a = snap({ packsEarned: 9, studyTotal: 40, owned: { goggles: 1 } });
    const b = snap({ packsEarned: 4, studyTotal: 90, owned: { goggles: 5 } });
    expect(mergeSnapshots(a, b)).toEqual(mergeSnapshots(b, a));
  });

  it('같은 값을 두 번 합쳐도 변하지 않는다(멱등)', () => {
    const a = snap({ packsEarned: 7, shardsEarned: 120, owned: { elb: 2 } });
    const once = mergeSnapshots(a, a);
    expect(mergeSnapshots(once, a)).toEqual(once);
  });

  it('오래된 스냅샷이 기록을 되감지 못한다', () => {
    const current = snap({ packsEarned: 100, packsOpened: 80, studyTotal: 500 });
    const stale = snap({ packsEarned: 3, packsOpened: 1, studyTotal: 10 });
    const merged = mergeSnapshots(current, stale);
    expect(merged.packsEarned).toBe(100);
    expect(merged.packsOpened).toBe(80);
    expect(merged.studyTotal).toBe(500);
  });

  it('사용한 코드는 합집합이다', () => {
    // 한쪽 기기에서만 쓴 코드도 다시 쓸 수 없어야 한다.
    const merged = mergeSnapshots(
      snap({ redeemedCodes: ['WELCOME'] }),
      snap({ redeemedCodes: ['SUMMER', 'WELCOME'] }),
    );
    expect(merged.redeemedCodes).toEqual(['SUMMER', 'WELCOME']);
  });

  it('무료팩 수령일은 더 나중 날이 남는다', () => {
    // 되감기면 기기를 옮겨 가며 같은 날 무료팩을 여러 번 받을 수 있다.
    const merged = mergeSnapshots(
      snap({ lastDailyPack: '2026-08-07' }),
      snap({ lastDailyPack: '2026-08-06' }),
    );
    expect(merged.lastDailyPack).toBe('2026-08-07');
  });

  it('천장은 더 오래 못 받은 쪽을 인정한다', () => {
    // 반대로 잡으면 기기를 바꿔 가며 천장을 초기화해 상위 등급을 앞당길 수 있다.
    const merged = mergeSnapshots(
      snap({ sinceEpic: 5, sinceLegendary: 30 }),
      snap({ sinceEpic: 1, sinceLegendary: 2 }),
    );
    expect(merged.sinceEpic).toBe(5);
    expect(merged.sinceLegendary).toBe(30);
  });

  it('규칙 수령 횟수도 최댓값으로 합쳐진다', () => {
    const merged = mergeSnapshots(
      snap({ claimedRules: { 'study-50': 3, 'attend-3': 1 } }),
      snap({ claimedRules: { 'study-50': 1, 'collect-50': 1 } }),
    );
    expect(merged.claimedRules).toEqual({ 'study-50': 3, 'attend-3': 1, 'collect-50': 1 });
  });

  it('빈 스냅샷과 합쳐도 잃는 것이 없다', () => {
    // 서버에 아직 아무것도 없는 첫 동기화에서 로컬이 지워지면 안 된다.
    const local = snap({ packsEarned: 8, owned: { elb: 2 }, redeemedCodes: ['X'] });
    expect(mergeSnapshots(local, EMPTY_SNAPSHOT)).toEqual(local);
    expect(mergeSnapshots(EMPTY_SNAPSHOT, local)).toEqual(local);
  });
});
