import { toFactionId, FACTIONS } from '../factions';
import { factionStandings, monthToSeed } from '../../__tests__/fixtures/factions';

/**
 * 진영 대항전 — **우승 진영은 앱이 정하지 않는다.**
 *
 * 분배 계산은 서버(BE service/faction.go)가 이 파일을 옮긴 것이라 지금은 두 결과가
 * 같다. 하지만 어느 한쪽이 바뀌는 날, 같은 달을 두고 앱은 '이번 달 선두는 볼트'
 * 라고 하고 지난 달 기록의 색은 서버가 고른 다른 진영으로 칠해진다 — 한 화면
 * 안에서 두 말이 어긋난다. 그래서 서버가 준 winner 를 정본으로 삼는다.
 */
describe('factionStandings', () => {
  const SEED = monthToSeed('2026-09');

  it('세 진영을 층수 내림차순으로 돌려준다', () => {
    const s = factionStandings(120_000, 20_000, SEED);
    expect(s.map((x) => x.id).sort()).toEqual(['flame', 'frost', 'volt']);
    for (let i = 1; i < s.length; i++) {
      expect(s[i - 1].floors).toBeGreaterThanOrEqual(s[i].floors);
    }
  });

  it('같은 입력이면 같은 결과다(새로고침에도 값이 튀지 않는다)', () => {
    const a = factionStandings(120_000, 20_000, SEED);
    const b = factionStandings(120_000, 20_000, SEED);
    expect(a).toEqual(b);
  });

  it('서버가 우승 진영을 말하면 그 진영이 1위가 된다', () => {
    const natural = factionStandings(120_000, 20_000, SEED)[0].id;
    const other = (['frost', 'flame', 'volt'] as const).find((id) => id !== natural)!;
    expect(factionStandings(120_000, 20_000, SEED, other)[0].id).toBe(other);
  });

  it('자리를 맞바꿔도 총 기여량은 보존된다(숫자를 새로 지어내지 않는다)', () => {
    const before = factionStandings(120_000, 20_000, SEED);
    const total = before.reduce((a, s) => a + s.problems, 0);
    const after = factionStandings(120_000, 20_000, SEED, 'volt');
    expect(after.reduce((a, s) => a + s.problems, 0)).toBe(total);
    expect(after.map((s) => s.problems)).toEqual(before.map((s) => s.problems));
  });

  it('우승 진영을 주지 않으면 분배 결과를 그대로 둔다', () => {
    expect(factionStandings(120_000, 20_000, SEED, null)).toEqual(
      factionStandings(120_000, 20_000, SEED),
    );
  });

  it('누적이 0 이어도 0 으로 나누지 않는다', () => {
    const s = factionStandings(0, 0, SEED);
    expect(s).toHaveLength(3);
    for (const x of s) expect(Number.isFinite(x.floors)).toBe(true);
  });
});

describe('toFactionId', () => {
  it('아는 진영만 통과시킨다', () => {
    for (const id of Object.keys(FACTIONS)) expect(toFactionId(id)).toBe(id);
  });

  it("빈 값·모르는 값은 null 이다 — '아직 아무도 이기지 않았다'", () => {
    expect(toFactionId('')).toBeNull();
    expect(toFactionId(undefined)).toBeNull();
    expect(toFactionId(null)).toBeNull();
    expect(toFactionId('storm')).toBeNull();
  });
});
