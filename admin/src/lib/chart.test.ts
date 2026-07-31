import { describe, it, expect } from 'vitest';

import {
  barWidth,
  dayStrip,
  divergingAxisMax,
  divergingBar,
  longestStreak,
  niceMax,
  pairMark,
  sparklinePath,
} from './chart';

// 차트는 눈으로 검증할 수 없다. 막대가 반대쪽에 그려져도, 축이 잘려도 화면은
// 그럴듯하고 — 오히려 그럴듯해서 더 위험하다. 그래서 좌표를 표로 못 박는다.

describe('발산 막대', () => {
  it('또래보다 나쁘면 기준선 오른쪽으로 뻗는다', () => {
    // 이 방향이 뒤집히면 잘하는 사람이 못하는 사람으로 읽힌다.
    const b = divergingBar(25, 50);
    expect(b.side).toBe('worse');
    expect(b.x).toBe(50);
    expect(b.width).toBe(25);
  });

  it('또래보다 나으면 왼쪽으로 뻗는다', () => {
    const b = divergingBar(-25, 50);
    expect(b.side).toBe('better');
    expect(b.x).toBe(25);
    expect(b.width).toBe(25);
  });

  it('좌우 길이가 대칭이다', () => {
    // 한쪽만 늘리면 같은 크기의 차이가 다르게 보인다.
    const worse = divergingBar(30, 50);
    const better = divergingBar(-30, 50);
    expect(worse.width).toBe(better.width);
  });

  it('차이가 없으면 아무것도 그리지 않는다', () => {
    // 0 을 1px 막대로 그리면 '아주 조금 나쁨'으로 읽힌다.
    expect(divergingBar(0, 50)).toEqual({ x: 50, width: 0, side: 'none' });
  });

  it('축을 벗어난 값은 잘라 낸다', () => {
    // 넘치게 그리면 옆 칸을 침범해 값이 겹쳐 읽힌다.
    const b = divergingBar(999, 50);
    expect(b.width).toBe(50);
    expect(b.x + b.width).toBe(100);
  });

  it('축이 없으면 0 으로 나누지 않는다', () => {
    expect(divergingBar(10, 0).width).toBe(0);
    expect(divergingBar(Number.NaN, 50).width).toBe(0);
  });
});

describe('발산 축', () => {
  it('깔끔한 수에서 끊는다', () => {
    // 최댓값을 그대로 축으로 쓰면 1등 막대가 늘 끝까지 닿아,
    // 격차가 5%p 든 60%p 든 똑같이 심각해 보인다.
    expect(divergingAxisMax([7, -3])).toBe(10);
    expect(divergingAxisMax([12])).toBe(20);
    expect(divergingAxisMax([58])).toBe(100);
  });

  it('부호와 무관하게 절댓값으로 정한다', () => {
    expect(divergingAxisMax([-45])).toBe(50);
  });

  it('데이터가 없어도 축이 무너지지 않는다', () => {
    expect(divergingAxisMax([])).toBe(10);
  });
});

describe('본인 vs 또래', () => {
  it('두 점과 잇는 선을 배치한다', () => {
    const m = pairMark(75, 17, 100, true);
    expect(m.selfX).toBe(75);
    expect(m.peerX).toBe(17);
    expect(m.linkX).toBe(17);
    expect(m.linkWidth).toBe(58);
  });

  it('실패율은 클수록 나쁘다', () => {
    expect(pairMark(75, 17, 100, true).worse).toBe(true);
    expect(pairMark(10, 17, 100, true).worse).toBe(false);
  });

  it('숙달률은 작을수록 나쁘다', () => {
    // 두 지표를 같은 규칙으로 칠하면 잘하는 쪽이 빨갛게 된다.
    expect(pairMark(38, 72, 100, false).worse).toBe(true);
    expect(pairMark(90, 72, 100, false).worse).toBe(false);
  });

  it('어느 쪽이 크든 잇는 선은 같은 자리에 있다', () => {
    const a = pairMark(20, 80, 100, true);
    const b = pairMark(80, 20, 100, true);
    expect(a.linkX).toBe(b.linkX);
    expect(a.linkWidth).toBe(b.linkWidth);
  });

  it('축 밖으로 나가지 않는다', () => {
    const m = pairMark(500, -100, 100, true);
    expect(m.selfX).toBe(100);
    expect(m.peerX).toBe(0);
  });
});

describe('학습 리듬 띠', () => {
  const pts = [
    { day: '2026-07-26', users: 1, weekday: 0 },
    { day: '2026-07-27', users: 0, weekday: 1 },
    { day: '2026-07-28', users: 2, weekday: 2 },
  ];

  it('학습한 날만 채운다', () => {
    expect(dayStrip(pts).map((c) => c.active)).toEqual([true, false, true]);
  });

  it('주 경계를 표시하되 맨 앞은 제외한다', () => {
    // 왼쪽 끝에 구분선을 그으면 띠가 시작 전에 잘린 것처럼 보인다.
    const cells = dayStrip([{ day: 'a', users: 0, weekday: 0 }, ...pts]);
    expect(cells[0]!.weekStart).toBe(false);
    expect(cells[1]!.weekStart).toBe(true);
  });

  it('빈 입력에도 무너지지 않는다', () => {
    expect(dayStrip([])).toEqual([]);
  });
});

describe('연속 학습일', () => {
  it('가장 긴 구간을 센다', () => {
    // '띄엄띄엄'과 '몰아서'는 총 일수가 같아도 전혀 다른 상태다.
    const cells = dayStrip(
      [1, 1, 0, 1, 1, 1, 0].map((u, i) => ({ day: `d${i}`, users: u, weekday: i % 7 })),
    );
    expect(longestStreak(cells)).toBe(3);
  });

  it('학습한 날이 없으면 0', () => {
    expect(longestStreak(dayStrip([{ day: 'a', users: 0, weekday: 1 }]))).toBe(0);
  });

  it('끝까지 이어져도 센다', () => {
    const cells = dayStrip([0, 1, 1].map((u, i) => ({ day: `d${i}`, users: u, weekday: i })));
    expect(longestStreak(cells)).toBe(2);
  });
});

describe('막대 축', () => {
  it('축 최댓값을 깔끔한 수로 올린다', () => {
    expect(niceMax([7])).toBe(10);
    expect(niceMax([0.8])).toBe(1);
    expect(niceMax([120])).toBe(150);
  });

  it('값이 없으면 축이 0 이 되지 않는다', () => {
    // 0 이면 모든 막대를 0 으로 나눈다.
    expect(niceMax([])).toBe(1);
    expect(niceMax([0, 0])).toBe(1);
  });

  it('너비를 0~100 으로 묶는다', () => {
    expect(barWidth(5, 10)).toBe(50);
    expect(barWidth(20, 10)).toBe(100);
    expect(barWidth(-5, 10)).toBe(0);
    expect(barWidth(5, 0)).toBe(0);
  });
});

describe('스파크라인', () => {
  /** "M0 5L10 1" → [{x:0,y:5},{x:10,y:1}] */
  function parse(d: string): { x: number; y: number }[] {
    return [...d.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map((m) => ({
      x: Number(m[1]),
      y: Number(m[2]),
    }));
  }

  it('그릴 것이 없으면 빈 경로를 준다', () => {
    // 빈 문자열이어야 호출부가 <path> 자체를 그리지 않는다.
    expect(sparklinePath([], 100, 20)).toBe('');
    expect(sparklinePath([1, 2], 0, 20)).toBe('');
    expect(sparklinePath([1, 2], 100, 0)).toBe('');
  });

  it('점이 하나면 가운데 평평한 선', () => {
    // 점 하나로는 추세랄 것이 없다. 위나 아래에 붙이면 없는 방향을 지어낸다.
    expect(sparklinePath([42], 100, 20)).toBe('M0 10L100 10');
  });

  it('점을 가로로 고르게 나눈다', () => {
    const pts = parse(sparklinePath([1, 2, 3, 4, 5], 100, 20));
    expect(pts.map((p) => p.x)).toEqual([0, 25, 50, 75, 100]);
  });

  it('큰 값이 위에 온다(SVG y 뒤집기)', () => {
    // y 는 아래로 자라므로, 최댓값의 y 가 최솟값의 y 보다 작아야 한다.
    const pts = parse(sparklinePath([0, 100], 100, 20));
    expect(pts[0]!.y).toBeGreaterThan(pts[1]!.y);
  });

  it('위아래 가장자리에 붙지 않는다', () => {
    // 선이 잘려 보이지 않도록 여백을 남긴다.
    const pts = parse(sparklinePath([0, 100], 100, 20));
    expect(Math.min(...pts.map((p) => p.y))).toBeGreaterThan(0);
    expect(Math.max(...pts.map((p) => p.y))).toBeLessThan(20);
  });

  it('값이 모두 같으면 평평하게 그린다', () => {
    const pts = parse(sparklinePath([5, 5, 5], 100, 20));
    expect(pts.every((p) => p.y === 10)).toBe(true);
  });

  it('변동이 값에 비해 미미하면 평평하게 그린다', () => {
    // 1000 → 1001 은 '별일 없음'이다. 최솟값을 바닥으로 잡았다는 이유로
    // 이것을 위아래 꽉 찬 그래프로 그리면 눈금 없는 그림에서 거짓말이 된다.
    const pts = parse(sparklinePath([1000, 1001, 1000], 100, 20));
    expect(pts.every((p) => p.y === 10)).toBe(true);
  });

  it('의미 있는 변동은 평평하게 만들지 않는다', () => {
    const pts = parse(sparklinePath([100, 200, 150], 100, 20));
    expect(new Set(pts.map((p) => p.y)).size).toBeGreaterThan(1);
  });

  it('숫자가 아닌 값은 건너뛴다', () => {
    const pts = parse(sparklinePath([1, NaN, 3], 100, 20));
    expect(pts).toHaveLength(2);
  });
});
