// 간격 반복(Spaced Repetition) 스케줄러 — Leitner 박스 기반의 마이크로러닝 복습 엔진.
// 백엔드와 무관하게 순수 함수로 구현하여 로컬에서 예측 가능하게 동작한다.

export type Grade = 'again' | 'hard' | 'good' | 'easy';

export interface SrsCardState {
  /** Leitner 박스 단계 (0=방금 배움 ~ 5=장기기억) */
  box: number;
  /** 다음 복습 예정 시각(epoch ms) */
  dueAt: number;
  /** 누적 복습 횟수 */
  reps: number;
  /** 망각(again) 횟수 */
  lapses: number;
  lastGrade: Grade | null;
  lastReviewedAt: number | null;
}

const MIN = 60_000;
const DAY = 86_400_000;
export const MAX_BOX = 5;

/** 박스 단계별 기본 복습 간격(일). box 0 은 같은 세션 내 재노출(10분). */
export const BOX_INTERVAL_DAYS = [0, 1, 3, 7, 16, 35] as const;
const AGAIN_DELAY = 10 * MIN;

/** 박스 단계 → 다음 간격(ms). */
export function boxIntervalMs(box: number): number {
  const clamped = Math.max(0, Math.min(MAX_BOX, box));
  const days = BOX_INTERVAL_DAYS[clamped];
  return days === 0 ? AGAIN_DELAY : days * DAY;
}

export function initialState(now: number = Date.now()): SrsCardState {
  return { box: 0, dueAt: now, reps: 0, lapses: 0, lastGrade: null, lastReviewedAt: null };
}

/**
 * 채점 결과에 따라 다음 상태를 계산한다.
 *  - again: 박스 0 으로 강등, 10분 후 재노출, 망각 +1
 *  - hard : 현재 간격의 절반(최소 1일)만 뒤로, 박스 유지
 *  - good : 박스 +1, 표준 간격
 *  - easy : 박스 +2, 더 긴 간격
 */
export function schedule(prev: SrsCardState, grade: Grade, now: number = Date.now()): SrsCardState {
  const base = { ...prev, reps: prev.reps + 1, lastGrade: grade, lastReviewedAt: now };

  switch (grade) {
    case 'again':
      return { ...base, box: 0, lapses: prev.lapses + 1, dueAt: now + AGAIN_DELAY };
    case 'hard': {
      const box = Math.max(1, prev.box);
      const interval = Math.max(DAY, Math.round(boxIntervalMs(box) * 0.5));
      return { ...base, box, dueAt: now + interval };
    }
    case 'good': {
      const box = Math.min(MAX_BOX, prev.box + 1);
      return { ...base, box, dueAt: now + boxIntervalMs(box) };
    }
    case 'easy': {
      const box = Math.min(MAX_BOX, prev.box + 2);
      return { ...base, box, dueAt: now + boxIntervalMs(box) };
    }
  }
}

/** 채점 시 사용자에게 보여줄 "다음 복습까지" 예상 간격 라벨. */
export function predictLabel(prev: SrsCardState, grade: Grade, now: number = Date.now()): string {
  const next = schedule(prev, grade, now);
  return humanizeInterval(next.dueAt - now);
}

export function humanizeInterval(ms: number): string {
  if (ms <= 0) return '지금';
  if (ms < 60 * MIN) return `${Math.max(1, Math.round(ms / MIN))}분`;
  if (ms < DAY) return `${Math.round(ms / (60 * MIN))}시간`;
  const days = Math.round(ms / DAY);
  if (days < 30) return `${days}일`;
  return `${Math.round(days / 30)}개월`;
}

export function isDue(state: SrsCardState, now: number = Date.now()): boolean {
  return state.dueAt <= now;
}

/** 박스 단계 → 기억 강도(0~1). 진행바/링 시각화에 사용. */
export function memoryStrength(box: number): number {
  return Math.max(0, Math.min(1, box / MAX_BOX));
}

export const BOX_META: { label: string; color: string }[] = [
  { label: '새 카드', color: '#94A3B8' },
  { label: '학습 1', color: '#60A5FA' },
  { label: '학습 2', color: '#38BDF8' },
  { label: '숙련', color: '#2DD4BF' },
  { label: '견고', color: '#34D399' },
  { label: '장기기억', color: '#22C55E' },
];
