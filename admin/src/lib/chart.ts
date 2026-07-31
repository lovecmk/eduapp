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

/**
 * 지표 타일에 들어가는 아주 작은 추세선(스파크라인)의 경로.
 *
 * 왜 필요한가: '오류율 2.1%' 는 그 자체로 좋고 나쁨을 말하지 않는다. 30분째
 * 2.1% 로 평평한 것과, 0.2% 에서 방금 치솟아 2.1% 가 된 것은 완전히 다른 상황인데
 * 숫자 하나로는 둘을 구분할 수 없다. 관리자가 그 차이를 알려면 지금까지는
 * 아래 그래프까지 내려가야 했다. 타일 안에 형태를 같이 두면 눈을 옮길 필요가 없다.
 *
 * ── 축을 0 이 아니라 최솟값에서 시작하는 이유 ──────────────────────────
 * 스파크라인이 답하는 질문은 '얼마나 큰가'가 아니라 **'어느 쪽으로 가고 있나'** 다.
 * 크기는 바로 옆의 숫자가 이미 말하고 있다. 0 을 바닥으로 잡으면 950~1000 사이의
 * 변화가 한 픽셀로 눌려 아무것도 보이지 않는다.
 *
 * ── 다만 평평한 것은 평평하게 그린다 ─────────────────────────────────
 * 최솟값을 바닥으로 잡으면 **모든** 계열이 위아래로 꽉 차게 그려진다. 그러면
 * 1000 → 1001 로 흔들린 계열이 0 → 1000 으로 치솟은 것과 똑같이 극적으로 보인다.
 * 눈금 없는 그림에서 이건 거짓말에 가깝다. 그래서 변동 폭이 값의 크기에 비해
 * 무시할 만하면(2% 미만) 가운데 평평한 선으로 그린다 — '별일 없다'가 정직한 답이다.
 *
 * @returns SVG path. 그릴 것이 없으면 빈 문자열(호출부가 아무것도 그리지 않는다).
 */
export function sparklinePath(values: number[], w: number, h: number): string {
  const pts = values.filter((v) => Number.isFinite(v));
  if (pts.length === 0 || w <= 0 || h <= 0) return '';

  // 점이 하나뿐이면 추세랄 게 없다 — 가운데 평평한 선.
  if (pts.length === 1) return `M0 ${h / 2}L${w} ${h / 2}`;

  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min;
  // 선이 위아래 가장자리에 딱 붙으면 잘려 보인다. 위아래로 조금 비워 둔다.
  const pad = h * 0.12;
  const usable = h - pad * 2;

  const flat = range === 0 || range < Math.abs(max) * 0.02;
  const step = w / (pts.length - 1);

  const y = (v: number): number => {
    if (flat) return h / 2;
    // SVG 는 y 가 아래로 자란다 — 큰 값이 위로 가도록 뒤집는다.
    return pad + (1 - (v - min) / range) * usable;
  };

  return pts
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${round(i * step)} ${round(y(v))}`)
    .join('');
}

/** 소수점 두 자리로 — 좌표 문자열이 길어지면 DOM 만 무거워지고 보이는 건 같다. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
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
