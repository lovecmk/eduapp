import type {
  ActivityPoint,
  Anomaly,
  CardCalibration,
  Evidence,
  EvidenceStrength,
  Insight,
  Prescription,
  Severity,
} from '../api/types';

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

/** 난이도 표기가 어느 쪽으로 어긋났는지 사람 말로. */
export function calibrationLabel(c: CardCalibration): string {
  return c.verdict === 'harder' ? '표기보다 어려움' : '표기보다 쉬움';
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

// ─────────────────────────────────────────────────────────────────────────────
// 교육 처방
//
// 여기 함수들은 전부 '번역'만 한다. 처방을 낼지 말지, 어느 것이 먼저인지는
// 서버가 이미 정했다. 화면에서 한 번 더 판단하면 두 규칙이 갈라지고, 갈라지면
// 반드시 한쪽만 고쳐진다.
// ─────────────────────────────────────────────────────────────────────────────

/** 언제까지 할 일인가. 전부 '급함'이면 우선순위가 없는 것과 같다. */
export function priorityLabel(p: Prescription['priority']): string {
  switch (p) {
    case 'now':
      return '이번 주';
    case 'soon':
      return '이번 달';
    default:
      return '여유 있을 때';
  }
}

/** 교육의 성격 — 사람을 가르칠 일인지, 자료를 고칠 일인지가 한눈에 갈려야 한다. */
export function kindLabel(k: Prescription['kind']): string {
  switch (k) {
    case 'onboarding':
      return '진입';
    case 'engagement':
      return '복귀';
    case 'category':
      return '분야 교육';
    case 'cards':
      return '개별 코칭';
    case 'retention':
      return '학습 방법';
    default:
      return '자료 보완';
  }
}

/**
 * 확신도를 **말로** 풀어 준다.
 *
 * 'medium' 만 띄우면 담당자는 그것이 "적당히 믿어도 된다"인지
 * "표본이 모자라다"인지 알 수 없다. 근거의 한계를 숨기면 처방 전체가 과신된다.
 */
export function confidenceNote(c: Prescription['confidence']): string {
  switch (c) {
    case 'high':
      return '서로 다른 근거 둘 이상이 같은 결론을 가리킵니다';
    case 'medium':
      return '근거는 분명하지만 비교한 기록이 조금 적습니다';
    default:
      return '아직 짐작에 가깝습니다 — 실행 전에 직접 확인해 보세요';
  }
}

export function confidenceLabel(c: Prescription['confidence']): string {
  switch (c) {
    case 'high':
      return '확신 높음';
    case 'medium':
      return '확신 보통';
    default:
      return '확신 낮음';
  }
}

/**
 * 근거 한 줄의 세기.
 *
 * '강함/보통/약함'만 띄우면 무엇이 강한지 알 수 없다. 이 세기는 **기록이 얼마나
 * 많은가**에서 나오므로, 그 뜻을 이름에 넣는다.
 */
export function strengthLabel(s: EvidenceStrength): string {
  switch (s) {
    case 'strong':
      return '기록 충분';
    case 'moderate':
      return '기록 보통';
    default:
      return '기록 적음';
  }
}

/**
 * 근거가 '비교까지 마친' 것인지 알려 준다.
 *
 * 비교 대상 없는 관측은 그 자체로 아무 말도 하지 않는다(실패율 30% 는 남들이
 * 10% 면 심각하고 35% 면 평범하다). 화면에서 이 둘을 같아 보이게 두면
 * 담당자는 근거의 질을 구별할 수 없다.
 */
export function isComparative(e: Evidence): boolean {
  return Boolean(e.compared && e.compared.trim());
}

/** 분 단위 소요 시간을 사람이 읽는 단위로. */
export function minutesLabel(m: number): string {
  if (!Number.isFinite(m) || m <= 0) return '—';
  if (m < 60) return `${Math.round(m)}분`;
  const h = Math.floor(m / 60);
  const rest = Math.round(m % 60);
  return rest === 0 ? `${h}시간` : `${h}시간 ${rest}분`;
}

/**
 * 처방 전체에 드는 시간.
 *
 * 총량을 보여 주는 이유: 개별 처방이 아무리 타당해도 다 합쳐 세 시간이면
 * 담당자는 아무것도 시작하지 못한다. 무엇을 이번 주에 자를지 정하려면
 * 총량이 먼저 보여야 한다.
 */
export function totalMinutes(ps: Prescription[]): number {
  return ps.reduce((sum, p) => sum + (Number.isFinite(p.minutes) ? p.minutes : 0), 0);
}

/** '이번 주에 할 일'만 따로 — 목록 전체를 훑지 않아도 오늘 할 일이 보이게. */
export function nowPrescriptions(ps: Prescription[]): Prescription[] {
  return ps.filter((p) => p.priority === 'now');
}
