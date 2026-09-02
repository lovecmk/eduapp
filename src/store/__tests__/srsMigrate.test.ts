/**
 * SRS 저장소 마이그레이션 — 지워야 할 때만 지우는가.
 *
 * v2 의 목적은 예전 버전이 심어둔 '가짜 복습이력/스케줄'을 일괄 제거하는 것이었고,
 * 그래서 migrate 가 무조건 빈 상태를 돌려주도록 적혀 있었다. 그런데 migrate 는
 * **어느 버전에서 올라오든** 불린다 — 다음 사람이 아무 이유로든 version 을 3 으로
 * 올리는 순간 그 한 줄이 모든 사용자의 학습 이력과 이어달리기를 조용히 지운다.
 * 몇 달치 기록이고, 지워졌다는 사실조차 화면에 뜨지 않는다.
 */
import { useSrsStore } from '../srsStore';

type Persisted = { cards: Record<string, unknown>; history: Record<string, string[]>; seeded: boolean };

const migrate = useSrsStore.persist.getOptions().migrate as (p: unknown, from: number) => Persisted;

const saved = (): Persisted => ({
  cards: { c1: { box: 3, dueAt: 1_700_000_000_000, lapses: 0 } },
  history: { '2026-7-25': ['c1', 'c2'] },
  seeded: true,
});

describe('srsStore 마이그레이션', () => {
  it('v2 이전에서 올라올 때는 가짜 이력을 지운다(원래 의도)', () => {
    const next = migrate(saved(), 1);
    expect(next.cards).toEqual({});
    expect(next.history).toEqual({});
    expect(next.seeded).toBe(false);
  });

  it('v2 이상에서 올라올 때는 학습 이력을 그대로 물려받는다', () => {
    const before = saved();
    const next = migrate(before, 2);
    expect(next.history).toEqual(before.history);
    expect(next.cards).toEqual(before.cards);
  });

  it('앞으로 버전을 올려도 이력이 사라지지 않는다', () => {
    const before = saved();
    // 다음 사람이 v3 를 만들며 이 테스트를 깨뜨린다면, 그건 사용자 기록을
    // 지우겠다는 결정이므로 반드시 의식적으로 이루어져야 한다.
    const next = migrate(before, 3);
    expect(next.history).toEqual(before.history);
  });
});
