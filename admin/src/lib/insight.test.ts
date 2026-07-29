import { describe, it, expect } from 'vitest';

import {
  anomalyMarks,
  applyCategoryFilter,
  churnLabel,
  confidenceLabel,
  confidenceNote,
  funnelWidth,
  heatIntensity,
  isComparative,
  kindLabel,
  minutesLabel,
  nowPrescriptions,
  pct,
  priorityLabel,
  severityBadge,
  sparklinePoints,
  strengthLabel,
  totalMinutes,
} from './insight';
import type { ActivityPoint, Evidence, Insight, Prescription } from '../api/types';

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

// ─────────────────────────────────────────────────────────────────────────────
// 교육 처방
//
// 이 화면의 값어치는 "이 교육을 왜 이 사람이 받아야 하는가"에 답하는 데 있다.
// 그 답이 흐려지는 방향의 실수 — 근거의 한계를 숨기거나, 총 소요를 감추거나,
// 사람 교육과 자료 수정을 같아 보이게 하는 것 — 을 여기서 막는다.
// ─────────────────────────────────────────────────────────────────────────────

const rx = (over: Partial<Prescription> = {}): Prescription =>
  ({
    id: 'p',
    rank: 1,
    priority: 'soon',
    kind: 'category',
    title: '처방',
    target: '',
    why: '',
    action: '',
    expect: '',
    minutes: 30,
    score: 1,
    confidence: 'medium',
    evidence: [],
    cards: [],
    ...over,
  }) as Prescription;

describe('처방 표기', () => {
  it('언제까지 할 일인지 기한으로 말한다', () => {
    // 'now/soon/later' 를 그대로 두면 전부 급해 보이고, 그러면 우선순위가 없다.
    expect(priorityLabel('now')).toBe('이번 주');
    expect(priorityLabel('soon')).toBe('이번 달');
    expect(priorityLabel('later')).toBe('여유 있을 때');
  });

  it('사람을 가르칠 일과 자료를 고칠 일을 다른 이름으로 부른다', () => {
    // 이 둘이 같아 보이면 개인 코칭 시간이 콘텐츠 문제로 새어 나간다.
    expect(kindLabel('cards')).toBe('개별 코칭');
    expect(kindLabel('content')).toBe('자료 보완');
    expect(kindLabel('category')).toBe('분야 교육');
    expect(kindLabel('engagement')).toBe('복귀');
    expect(kindLabel('onboarding')).toBe('진입');
    expect(kindLabel('retention')).toBe('학습 방법');
  });

  it('확신도의 한계를 문장으로 밝힌다', () => {
    // 'medium' 만 띄우면 "적당히 믿어도 됨"인지 "표본 부족"인지 알 수 없다.
    expect(confidenceLabel('high')).toBe('확신 높음');
    expect(confidenceNote('low')).toContain('직접 확인');
    // 담당자에게 통계 용어를 던지지 않는다.
    for (const c of ['high', 'medium', 'low'] as const) {
      expect(confidenceNote(c)).not.toContain('표본');
    }
    expect(confidenceNote('medium')).not.toBe(confidenceNote('high'));
  });

  it('근거의 세기가 무엇에서 나온 것인지 이름으로 밝힌다', () => {
    // '강함/약함'만 띄우면 무엇이 강한지 알 수 없다. 이 세기는 기록의 양에서
    // 나오므로 그 뜻이 이름에 있어야 한다.
    expect(strengthLabel('strong')).toBe('기록 충분');
    expect(strengthLabel('moderate')).toBe('기록 보통');
    expect(strengthLabel('weak')).toBe('기록 적음');
  });
});

describe('근거의 질', () => {
  const ev = (over: Partial<Evidence>): Evidence =>
    ({ fact: 'f', observed: 'o', rule: 'r', source: 's', strength: 'strong', ...over }) as Evidence;

  it('비교 대상이 있는 근거를 가려낸다', () => {
    // 비교 없는 관측은 아무 말도 하지 않는다 — 실패율 30%는 남들이 10%면
    // 심각하고 35%면 평범하다. 화면에서 둘이 같아 보이면 근거의 질이 사라진다.
    expect(isComparative(ev({ compared: '또래 10%' }))).toBe(true);
    expect(isComparative(ev({}))).toBe(false);
    expect(isComparative(ev({ compared: '   ' }))).toBe(false);
  });
});

describe('소요 시간', () => {
  it('한 시간이 넘으면 시간 단위로 읽어 준다', () => {
    expect(minutesLabel(45)).toBe('45분');
    expect(minutesLabel(60)).toBe('1시간');
    expect(minutesLabel(95)).toBe('1시간 35분');
  });

  it('알 수 없는 값을 0분으로 위장하지 않는다', () => {
    expect(minutesLabel(0)).toBe('—');
    expect(minutesLabel(Number.NaN)).toBe('—');
  });

  it('전부 더한 총량을 준다', () => {
    // 개별 처방이 타당해도 다 합쳐 세 시간이면 담당자는 시작조차 못 한다.
    // 무엇을 자를지 정하려면 총량이 먼저 보여야 한다.
    expect(totalMinutes([rx({ minutes: 30 }), rx({ minutes: 24 })])).toBe(54);
    expect(totalMinutes([])).toBe(0);
    expect(totalMinutes([rx({ minutes: Number.NaN })])).toBe(0);
  });
});

describe('이번 주 할 일', () => {
  it('급한 것만 따로 뽑는다', () => {
    const ps = [rx({ id: 'a', priority: 'now' }), rx({ id: 'b', priority: 'later' })];
    expect(nowPrescriptions(ps).map((p) => p.id)).toEqual(['a']);
  });

  it('서버가 정한 순서를 바꾸지 않는다', () => {
    // 화면에서 다시 정렬하면 서버의 우선순위와 갈라지고, 갈라지면 한쪽만 고쳐진다.
    const ps = [rx({ id: 'a', priority: 'now', score: 1 }), rx({ id: 'b', priority: 'now', score: 9 })];
    expect(nowPrescriptions(ps).map((p) => p.id)).toEqual(['a', 'b']);
  });
});
