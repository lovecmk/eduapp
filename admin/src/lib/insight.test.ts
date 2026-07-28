import { describe, it, expect } from 'vitest';

import {
  anomalyMarks,
  applyCategoryFilter,
  churnLabel,
  funnelWidth,
  heatIntensity,
  pct,
  severityBadge,
  sparklinePoints,
} from './insight';
import type { ActivityPoint, Insight } from '../api/types';

// 이 계산들은 눈으로 검증할 수 없다 — 히트맵 색이 한 칸 밀려도, 스파크라인이
// 뒤집혀도 화면은 그럴듯하다. 그래서 표로 못 박는다.

const days = (users: number[]): ActivityPoint[] =>
  users.map((u, i) => ({ day: `2026-07-${String(i + 1).padStart(2, '0')}`, users: u, weekday: 1 }));

describe('pct', () => {
  it('비율을 퍼센트로 반올림한다', () => {
    expect(pct(0.5)).toBe('50%');
    expect(pct(0.336)).toBe('34%');
    expect(pct(0)).toBe('0%');
    expect(pct(1)).toBe('100%');
  });

  it('계산할 수 없는 값은 숫자인 척하지 않는다', () => {
    // NaN 이 "NaN%" 로 화면에 찍히면 사용자는 그것도 지표라고 생각한다.
    expect(pct(Number.NaN)).toBe('—');
    expect(pct(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('sparklinePoints', () => {
  it('세로 눈금을 0 에서 시작한다', () => {
    // 최솟값을 바닥으로 잡으면 100↔103 이 절벽처럼 보여, 아무 일 없는 날이
    // 사건처럼 읽힌다.
    const pts = sparklinePoints(days([100, 103]), 100, 40);
    const ys = pts.split(' ').map((p) => Number(p.split(',')[1]));
    // 둘 다 위쪽(작은 y)에 몰려 있어야 한다 — 바닥까지 내려가면 안 된다.
    expect(ys[0]!).toBeLessThan(4);
    expect(ys[1]!).toBe(0);
  });

  it('가장 큰 값이 꼭대기에 닿는다', () => {
    const pts = sparklinePoints(days([0, 10]), 100, 40);
    expect(pts).toBe('0,40 100,0');
  });

  it('점이 하나뿐이면 평평한 선을 그린다', () => {
    // 나누기에서 0 이 되어 NaN 좌표가 나오면 SVG 가 통째로 사라진다.
    const pts = sparklinePoints(days([5]), 100, 40);
    expect(pts).toBe('0,0 100,0');
    expect(pts).not.toContain('NaN');
  });

  it('데이터가 없으면 빈 문자열', () => {
    expect(sparklinePoints([], 100, 40)).toBe('');
  });

  it('모두 0 이어도 NaN 을 만들지 않는다', () => {
    const pts = sparklinePoints(days([0, 0, 0]), 100, 40);
    expect(pts).not.toContain('NaN');
  });
});

describe('anomalyMarks', () => {
  it('이상이 있는 날의 좌표를 찾아 준다', () => {
    const points = days([10, 0, 10, 10]);
    const marks = anomalyMarks(
      points,
      [{ day: points[1]!.day, users: 0, expected: 10, deviation: -3, direction: 'drop' }],
      90,
      40,
    );
    expect(marks).toHaveLength(1);
    expect(marks[0]!.direction).toBe('drop');
    expect(marks[0]!.x).toBe(30); // 4점 중 두 번째 → 1/3 지점
    expect(marks[0]!.y).toBe(40); // 0명이므로 바닥
  });

  it('추세에 없는 날짜는 조용히 버린다', () => {
    // 서버가 더 긴 기간을 보고 이상을 잡았을 수 있다. 못 찾은 날을 0 좌표로
    // 그리면 왼쪽 끝에 가짜 표시가 생긴다.
    const marks = anomalyMarks(
      days([1, 2]),
      [{ day: '1999-01-01', users: 0, expected: 1, deviation: -9, direction: 'drop' }],
      90,
      40,
    );
    expect(marks).toEqual([]);
  });
});

describe('heatIntensity', () => {
  it('낮은 잔존율도 눈에 보이게 끌어올린다', () => {
    // 2주차 잔존 25% 를 그대로 칠하면 거의 투명해 무늬가 안 보인다.
    expect(heatIntensity(0.25)).toBe(0.5);
  });

  it('0 과 100% 는 그대로다', () => {
    expect(heatIntensity(0)).toBe(0);
    expect(heatIntensity(1)).toBe(1);
  });

  it('범위를 벗어난 값도 안전하다', () => {
    expect(heatIntensity(-1)).toBe(0);
    expect(heatIntensity(4)).toBe(1);
    expect(heatIntensity(Number.NaN)).toBe(0);
  });
});

describe('funnelWidth', () => {
  it('첫 단계를 100 으로 두고 줄어드는 폭을 보여 준다', () => {
    expect(funnelWidth(100, 100)).toBe(100);
    expect(funnelWidth(25, 100)).toBe(25);
  });

  it('첫 단계가 0 이면 0 이다 — 0 으로 나누지 않는다', () => {
    expect(funnelWidth(0, 0)).toBe(0);
  });

  it('넘치는 값은 잘라 낸다', () => {
    expect(funnelWidth(150, 100)).toBe(100);
  });
});

describe('applyCategoryFilter', () => {
  const base = {
    calibration: [
      { card_id: 'a', category: 'ELEC' },
      { card_id: 'b', category: 'FIRE' },
    ],
    categories: [{ category: 'ELEC' }, { category: 'FIRE' }],
    dead_content: [{ card_id: 'c', category: 'FIRE' }],
    churn: { top: [] },
  } as unknown as Insight;

  it('고른 분야로 여러 표를 한꺼번에 좁힌다', () => {
    // 표마다 따로 필터를 두면, 서로 다른 범위를 나란히 보며 같은 것을 본다고 착각한다.
    const got = applyCategoryFilter(base, 'FIRE');
    expect(got.calibration.map((c) => c.card_id)).toEqual(['b']);
    expect(got.categories.map((c) => c.category)).toEqual(['FIRE']);
    expect(got.dead_content.map((c) => c.card_id)).toEqual(['c']);
  });

  it('필터가 없으면 원본을 그대로 준다', () => {
    expect(applyCategoryFilter(base, null)).toBe(base);
  });

  it('원본을 바꾸지 않는다', () => {
    applyCategoryFilter(base, 'FIRE');
    expect(base.calibration).toHaveLength(2);
  });
});

describe('배지', () => {
  it('심각도에 맞는 색을 고른다', () => {
    expect(severityBadge('critical')).toBe('badge-danger');
    expect(severityBadge('warn')).toBe('badge-warn');
    expect(severityBadge('good')).toBe('badge-ok');
    expect(severityBadge('info')).toBe('badge-info');
  });

  it('이탈 등급을 우리말로 옮긴다', () => {
    expect(churnLabel('dormant')).toBe('휴면');
    expect(churnLabel('at_risk')).toBe('이탈 위험');
    expect(churnLabel('cooling')).toBe('식는 중');
  });
});
