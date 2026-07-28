import type { ActivityPoint, Anomaly, CardCalibration, Insight, Severity } from '../api/types';

/**
 * 분석 화면의 순수 계산.
 *
 * 화면(.vue)에는 표시만 남기고 계산은 여기로 뺀다. 이유는 두 가지다.
 *  · 여기 있는 값들은 **눈으로 검증할 수 없다.** 히트맵 색이 한 칸 밀려도,
 *    스파크라인이 뒤집혀도 그럴듯해 보인다. 표로 못 박을 수 있어야 한다.
 *  · 서버가 이미 판단을 끝냈으므로 화면은 다시 계산하면 안 된다.
 *    같은 규칙이 두 곳에 있으면 반드시 한쪽만 바뀐다.
 */

/** 심각도 → 배지 클래스. 색은 '지금 손대야 하는가'만 나타낸다. */
export function severityBadge(s: Severity): string {
  switch (s) {
    case 'critical':
      return 'badge-danger';
    case 'warn':
      return 'badge-warn';
    case 'good':
      return 'badge-ok';
    default:
      return 'badge-info';
  }
}

export function severityLabel(s: Severity): string {
  switch (s) {
    case 'critical':
      return '급함';
    case 'warn':
      return '주의';
    case 'good':
      return '양호';
    default:
      return '참고';
  }
}

/** 비율(0~1)을 퍼센트 문자열로. 소수점은 버린다 — 관리 화면에서 0.1%는 의미가 없다. */
export function pct(v: number): string {
  if (!Number.isFinite(v)) return '—';
  return `${Math.round(v * 100)}%`;
}

/**
 * 스파크라인의 폴리라인 좌표를 만든다.
 *
 * 세로 눈금은 항상 0 에서 시작한다. 최솟값을 바닥으로 잡으면 100↔103 같은
 * 미세한 변화가 절벽처럼 그려져, 아무 일도 없는 날이 사건처럼 보인다.
 */
export function sparklinePoints(points: ActivityPoint[], w: number, h: number): string {
  if (points.length === 0) return '';
  const max = Math.max(1, ...points.map((p) => p.users));
  if (points.length === 1) {
    const y = h - (points[0]!.users / max) * h;
    return `0,${round(y)} ${w},${round(y)}`;
  }
  const step = w / (points.length - 1);
  return points
    .map((p, i) => `${round(i * step)},${round(h - (p.users / max) * h)}`)
    .join(' ');
}

/** 이상 지점을 그리기 위해 날짜 → x 좌표로 옮긴다. */
export function anomalyMarks(
  points: ActivityPoint[],
  anomalies: Anomaly[],
  w: number,
  h: number,
): { x: number; y: number; direction: Anomaly['direction']; day: string; users: number }[] {
  if (points.length < 2) return [];
  const max = Math.max(1, ...points.map((p) => p.users));
  const step = w / (points.length - 1);
  const out = [];
  for (const a of anomalies) {
    const i = points.findIndex((p) => p.day === a.day);
    if (i < 0) continue;
    out.push({
      x: round(i * step),
      y: round(h - (points[i]!.users / max) * h),
      direction: a.direction,
      day: a.day,
      users: a.users,
    });
  }
  return out;
}

/**
 * 리텐션 히트맵 칸의 배경 강도(0~1).
 *
 * 잔존율을 그대로 불투명도로 쓰지 않는다. 실제 코호트에서 2주차 잔존은 흔히
 * 20~30% 인데, 그걸 그대로 칠하면 모든 칸이 거의 투명해 무늬가 안 보인다.
 * 제곱근으로 낮은 값을 끌어올려 차이를 읽을 수 있게 한다.
 */
export function heatIntensity(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return Math.min(1, Math.sqrt(rate));
}

/** 난이도 오표기의 방향을 사람 말로. */
export function calibrationLabel(c: CardCalibration): string {
  return c.verdict === 'harder' ? '선언보다 어려움' : '선언보다 쉬움';
}

/**
 * 분야 필터를 적용한다.
 *
 * 이 화면의 조사 흐름은 "분야 하나를 고르면 나머지가 전부 그 분야로 좁혀진다"이다.
 * 표마다 따로 필터를 두면 사용자가 각 표의 상태를 따로 기억해야 하고,
 * 서로 다른 범위를 나란히 보면서 같은 것을 본다고 착각하게 된다.
 */
export function applyCategoryFilter(insight: Insight, category: string | null): Insight {
  if (!category) return insight;
  return {
    ...insight,
    calibration: insight.calibration.filter((c) => c.category === category),
    categories: insight.categories.filter((c) => c.category === category),
    dead_content: insight.dead_content.filter((c) => c.category === category),
  };
}

/** 이탈 등급 → 배지 클래스. */
export function churnBadge(tier: string): string {
  switch (tier) {
    case 'dormant':
      return 'badge-danger';
    case 'at_risk':
      return 'badge-warn';
    default:
      return 'badge-neutral';
  }
}

export function churnLabel(tier: string): string {
  switch (tier) {
    case 'dormant':
      return '휴면';
    case 'at_risk':
      return '이탈 위험';
    case 'cooling':
      return '식는 중';
    default:
      return '활성';
  }
}

/**
 * 퍼널 막대의 너비(%) — 첫 단계를 100 으로 둔다.
 *
 * 직전 단계 대비가 아니라 **첫 단계 대비**로 그린다. 단계마다 100% 로 다시
 * 그리면 모든 막대가 꽉 차서, 정작 얼마나 줄었는지가 사라진다.
 */
export function funnelWidth(count: number, first: number): number {
  if (first <= 0) return 0;
  return Math.max(0, Math.min(100, (count / first) * 100));
}

function round(v: number): number {
  return Math.round(v * 10) / 10;
}
