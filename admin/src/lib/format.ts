/**
 * 화면 표시용 서식 헬퍼.
 *
 * 관리 콘솔은 숫자와 시각을 아주 많이 보여준다. 표시 규칙이 화면마다 다르면
 * 같은 값이 다르게 보여 신뢰를 잃으므로, 한곳에 모아 쓴다.
 */

/** 1234567 → "1,234,567". 숫자가 아니면 "-". */
export function num(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '-';
  return n.toLocaleString('ko-KR');
}

/** 12.345 → "12.3%" */
export function pct(n: number | null | undefined, digits = 1): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '-';
  return `${n.toFixed(digits)}%`;
}

/** 밀리초를 사람이 읽는 단위로. 1250 → "1.25초", 340 → "340ms" */
export function ms(v: number | null | undefined): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '-';
  if (v >= 1000) return `${(v / 1000).toFixed(2)}초`;
  return `${Math.round(v)}ms`;
}

/**
 * 초 단위 가동시간을 "3일 4시간 12분" 으로.
 * 가장 큰 단위 두 개까지만 — 초까지 보여주면 매 갱신마다 숫자가 튀어 눈이 피로하다.
 */
export function uptime(seconds: number | null | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '-';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}일`);
  if (h > 0) parts.push(`${h}시간`);
  if (m > 0 && parts.length < 2) parts.push(`${m}분`);
  if (parts.length === 0) return `${Math.floor(seconds)}초`;
  return parts.slice(0, 2).join(' ');
}

/** ISO 시각 → "2026-07-27 10:32". 파싱 불가면 "-" (Invalid Date 를 화면에 흘리지 않는다). */
export function dateTime(iso: string | null | undefined): string {
  const d = toDate(iso);
  if (!d) return '-';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** ISO 시각 → "2026-07-27" */
export function dateOnly(iso: string | null | undefined): string {
  const d = toDate(iso);
  if (!d) return '-';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** ISO 시각 → "방금", "3분 전", "2시간 전", "5일 전" */
export function timeAgo(iso: string | null | undefined, now: Date = new Date()): string {
  const d = toDate(iso);
  if (!d) return '-';
  const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
  // 서버·클라이언트 시계가 조금 어긋나 미래로 계산되는 경우가 있다 — '방금'으로 흡수한다.
  if (diffSec < 60) return '방금';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}시간 전`;
  if (diffSec < 86400 * 30) return `${Math.floor(diffSec / 86400)}일 전`;
  return dateOnly(iso);
}

/** 파싱 가능한 Date 만 돌려준다. 잘못된 문자열은 null(호출부가 "-" 로 표시). */
function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * HTTP 상태 코드를 배지 색으로.
 *
 * 돌려주는 값은 **디자인 토큰의 이름**이지 색 이름이 아니다(green 이 아니라 ok).
 * 호출부가 `badge-${statusTone(...)}` 로 클래스를 만들기 때문에, 여기서 색 이름을
 * 돌려주면 base.css 에 없는 클래스(badge-green)가 만들어져 배지가 통째로
 * 색을 잃는다 — 실제로 그랬다. 토큰 이름으로 맞춰 둔다.
 *
 * 이름을 색이 아니라 뜻으로 두는 이유이기도 하다. 다크 테마에서 --ok 는 초록이
 * 아닌 값으로 바뀔 수 있는데, 'green' 이라는 이름은 그때 거짓말이 된다.
 */
export function statusTone(status: number): 'ok' | 'warn' | 'danger' | 'neutral' {
  if (status >= 500) return 'danger';
  if (status >= 400) return 'warn';
  if (status >= 200 && status < 300) return 'ok';
  return 'neutral';
}

/** 계정 상태 코드를 한국어 이름표로. */
export function statusLabel(cd: string): string {
  if (cd === 'A' || cd === '') return '활성';
  if (cd === 'I') return '정지';
  if (cd === 'D') return '삭제';
  return cd;
}

/** 감사로그 action 코드를 사람이 읽는 이름으로. */
export function actionLabel(action: string): string {
  const map: Record<string, string> = {
    'user.role_change': '권한 변경',
    'user.status_change': '상태 변경',
    'card.create': '문제 등록',
    'card.update': '문제 수정',
    'card.delete': '문제 삭제',
  };
  return map[action] ?? action;
}

/** 문제 형식 코드를 이름표로. */
export function cardTypeLabel(cd: string): string {
  const map: Record<string, string> = { EXPLANATION: '설명형', OX: 'OX', CHOICE: '객관식' };
  return map[cd] ?? cd;
}

/** 난이도 코드를 이름표로. */
export function difficultyLabel(cd: string): string {
  const map: Record<string, string> = { EASY: '쉬움', MEDIUM: '보통', HARD: '어려움' };
  return map[cd] ?? cd;
}
