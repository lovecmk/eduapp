import { computeMoment } from '../moments';
import { dateKey } from '../dateKey';

/**
 * 축하 순간 — 다 만들어 두고 **부르는 곳이 없어 한 번도 뜨지 못했던** 팝업.
 *
 * 홈 화면이 계산 기준(sessionBaseline)까지 잡아 두면서도 computeMoment 를 부르지
 * 않아, 첫 실행 환영조차 보이지 않았다. 되살린 김에 규칙을 여기서 고정한다 —
 * 특히 '이미 축하한 것은 다시 축하하지 않는다'가 무너지면 같은 팝업이 매번 떠서
 * 사용자는 축하를 광고로 읽게 된다.
 */
const base = {
  totalLearned: 0,
  streakDays: 0,
  firstOpenAt: null as string | null,
  totalOpens: 1,
  lastOpenAt: null as string | null,
  celebrated: [] as string[],
};

const daysAgo = (n: number, now = new Date()) => new Date(now.getTime() - n * 86_400_000).toISOString();

describe('computeMoment', () => {
  it('첫 실행이면 환영한다', () => {
    expect(computeMoment({ ...base })?.kind).toBe('welcome');
  });

  it('환영은 한 번뿐이다', () => {
    expect(computeMoment({ ...base, celebrated: ['welcome'] })).toBeNull();
  });

  it('두 번째 실행부터는 환영하지 않는다', () => {
    expect(computeMoment({ ...base, totalOpens: 2 })).toBeNull();
  });

  it('기념일에 도달하면 축하한다', () => {
    const m = computeMoment({ ...base, totalOpens: 5, firstOpenAt: daysAgo(30) });
    expect(m?.kind).toBe('anniversary');
    expect(m?.key).toBe('anniv-30');
  });

  it('연속 학습이 이정표를 넘으면 축하한다', () => {
    const m = computeMoment({ ...base, totalOpens: 5, streakDays: 7 });
    expect(m?.kind).toBe('streak');
  });

  it('누적 학습이 이정표를 넘으면 축하한다', () => {
    const m = computeMoment({ ...base, totalOpens: 5, totalLearned: 100 });
    expect(m?.kind).toBe('milestone');
  });

  it('오래 쉬었다 돌아오면 반겨준다', () => {
    const m = computeMoment({ ...base, totalOpens: 5, lastOpenAt: daysAgo(10) });
    expect(m?.kind).toBe('comeback');
  });

  it('어제 왔다 오늘 다시 온 것은 복귀가 아니다', () => {
    expect(computeMoment({ ...base, totalOpens: 5, lastOpenAt: daysAgo(1) })).toBeNull();
  });

  it('복귀 축하는 하루에 한 번이다(로컬 날짜 기준)', () => {
    const now = new Date();
    const input = { ...base, totalOpens: 5, lastOpenAt: daysAgo(10, now), now };
    const first = computeMoment(input);
    expect(first?.key).toBe(`comeback-${dateKey(now)}`);
    expect(computeMoment({ ...input, celebrated: [first!.key] })).toBeNull();
  });

  it('축하할 것이 없으면 null 이다(없는 순간을 만들어 내지 않는다)', () => {
    expect(computeMoment({ ...base, totalOpens: 42, firstOpenAt: daysAgo(3), lastOpenAt: daysAgo(1) })).toBeNull();
  });

  it('어떤 순간이든 제목·메시지가 비어 있지 않다', () => {
    const cases = [
      { ...base },
      { ...base, totalOpens: 5, firstOpenAt: daysAgo(100) },
      { ...base, totalOpens: 5, streakDays: 30 },
      { ...base, totalOpens: 5, totalLearned: 500 },
      { ...base, totalOpens: 5, lastOpenAt: daysAgo(30) },
    ];
    for (const input of cases) {
      const m = computeMoment(input);
      expect(m).not.toBeNull();
      expect(m!.title.trim().length).toBeGreaterThan(0);
      expect(m!.message.trim().length).toBeGreaterThan(0);
      expect(m!.emoji.trim().length).toBeGreaterThan(0);
    }
  });
});
