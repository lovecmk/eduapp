/**
 * 차트 기하 계산.
 *
 * 화면(.vue)에는 그리기만 남기고 좌표 계산은 여기로 뺀다. 이유는 insight.ts 와 같다 —
 * **차트는 눈으로 검증할 수 없다.** 막대가 한 칸 밀려도, 기준선이 반대쪽에 그려져도
 * 화면은 그럴듯하다. 오히려 그럴듯해서 더 위험하다. 표로 못 박을 수 있어야 한다.
 *
 * 여기 있는 함수는 전부 순수 함수다. DOM 도 색도 모른다.
 */

/** 발산 막대 한 줄의 배치(퍼센트 좌표계, 0~100). */
export interface DivergingBar {
  /** 막대 왼쪽 끝(%). */
  x: number;
  /** 막대 너비(%). */
  width: number;
  /** 0 을 넘어선 방향. worse = 또래보다 나쁨. */
  side: 'worse' | 'better' | 'none';
}

/**
 * 0 을 가운데 두고 좌우로 뻗는 막대를 배치한다.
 *
 * 왜 발산 막대인가: '실패율 75%'는 그 자체로 아무 말도 하지 않는다. 또래가 17%면
 * 심각하고 80%면 평범하다. 읽는 사람이 매번 두 숫자를 빼서 비교하게 두면 결국
 * 안 읽는다. 차이(gap)를 직접 그리면 기준선 오른쪽에 있다는 것 하나로 끝난다.
 *
 * 축은 좌우 대칭이다. 한쪽만 늘리면 +30%p 와 −30%p 가 다른 길이로 그려져
 * 같은 크기의 차이가 다르게 보인다.
 *
 * @param value 본인 − 또래(양수면 본인이 더 많이 틀린다)
 * @param max   축의 한쪽 끝(절댓값). 0 이하면 배치하지 않는다.
 */
export function divergingBar(value: number, max: number): DivergingBar {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) {
    return { x: 50, width: 0, side: 'none' };
  }
  // 축을 벗어난 값은 잘라 낸다. 넘치게 그리면 옆 칸을 침범해 값이 겹쳐 읽힌다.
  const clamped = Math.max(-max, Math.min(max, value));
  const half = (Math.abs(clamped) / max) * 50;

  if (half === 0) return { x: 50, width: 0, side: 'none' };
  return clamped > 0
    ? { x: 50, width: half, side: 'worse' }
    : { x: 50 - half, width: half, side: 'better' };
}

/**
 * 발산 축의 끝값을 고른다.
 *
 * 데이터의 최댓값을 그대로 축으로 쓰면 가장 큰 막대가 항상 끝까지 닿아, 격차가
 * 5%p 든 60%p 든 똑같이 심각해 보인다. 눈금이 뜻을 가지려면 **깔끔한 수**에서
 * 끊어야 한다(10 · 20 · 25 · 50 · 100).
 */
export function divergingAxisMax(values: number[]): number {
  const peak = Math.max(0, ...values.map((v) => (Number.isFinite(v) ? Math.abs(v) : 0)));
  for (const step of [10, 20, 25, 50]) {
    if (peak <= step) return step;
  }
  return 100;
}

/** 두 값의 위치를 한 줄에 놓는 배치(퍼센트). */
export interface PairMark {
  /** 이 사람의 값 위치(%). */
  selfX: number;
  /** 또래 값 위치(%). */
  peerX: number;
  /** 두 점을 잇는 선의 시작(%)과 너비(%). */
  linkX: number;
  linkWidth: number;
  /** 이 사람이 또래보다 나쁜 쪽인가. */
  worse: boolean;
}

/**
 * '이 사람 vs 또래'를 한 줄에 놓는다(아령형).
 *
 * 막대 두 개를 나란히 그리지 않는 이유: 이 화면에서 읽어야 하는 것은 각각의
 * 크기가 아니라 **둘 사이의 거리**다. 막대 두 개는 길이를 비교하게 만들지만,
 * 아령형은 간격 자체를 하나의 형태로 보여 준다.
 *
 * @param higherIsWorse 값이 클수록 나쁜 지표인가(실패율=true, 숙달률=false)
 */
export function pairMark(
  self: number,
  peer: number,
  scaleMax: number,
  higherIsWorse: boolean,
): PairMark {
  const to = (v: number): number => {
    if (!Number.isFinite(v) || !Number.isFinite(scaleMax) || scaleMax <= 0) return 0;
    return Math.max(0, Math.min(100, (v / scaleMax) * 100));
  };
  const selfX = to(self);
  const peerX = to(peer);
  return {
    selfX,
    peerX,
    linkX: Math.min(selfX, peerX),
    linkWidth: Math.abs(selfX - peerX),
    worse: higherIsWorse ? self > peer : self < peer,
  };
}

/** 30일 학습 리듬의 한 칸. */
export interface DayCell {
  day: string;
  /** 그날 학습했는가. */
  active: boolean;
  /** 0(일)~6(토). */
  weekday: number;
  /** 이 칸이 그 주의 첫 칸인가(주 경계 표시용). */
  weekStart: boolean;
}

/**
 * 활동 기록을 30칸 띠로 만든다.
 *
 * 선그래프로 그리지 않는 이유: 값이 0 아니면 1 이라 선이 사각파가 되고, 그러면
 * '얼마나 했는가'를 읽는 것처럼 보인다. 실제로 읽어야 하는 것은 **띄엄띄엄한가,
 * 이어지는가**다. 칸으로 그리면 그 패턴이 그대로 보인다.
 */
export function dayStrip(points: { day: string; users: number; weekday: number }[]): DayCell[] {
  return points.map((p, i) => ({
    day: p.day,
    active: p.users > 0,
    weekday: p.weekday,
    // 첫 칸은 주의 시작으로 치지 않는다 — 왼쪽 끝에 굳이 구분선을 그을 이유가 없다.
    weekStart: i > 0 && p.weekday === 0,
  }));
}

/** 가장 긴 연속 학습일. '띄엄띄엄'과 '몰아서'를 가르는 값이다. */
export function longestStreak(cells: DayCell[]): number {
  let best = 0;
  let run = 0;
  for (const c of cells) {
    run = c.active ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

/** 수평 막대 하나의 너비(%). 축 최댓값이 0 이면 0(0 으로 나누지 않는다). */
export function barWidth(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

/**
 * 막대 축의 최댓값을 깔끔한 수로 올린다.
 *
 * 최댓값을 그대로 쓰면 1등 막대가 늘 끝까지 닿아, 그것이 100% 인지 12% 인지
 * 형태로는 알 수 없다.
 */
export function niceMax(values: number[]): number {
  const peak = Math.max(0, ...values.map((v) => (Number.isFinite(v) ? v : 0)));
  if (peak <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(peak));
  for (const mult of [1, 1.5, 2, 2.5, 5, 10]) {
    const step = mag * mult;
    if (peak <= step) return step;
  }
  return mag * 10;
}
