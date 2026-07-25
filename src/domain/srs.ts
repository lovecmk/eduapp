// 간격 반복(Spaced Repetition) 스케줄러 — Leitner 박스 기반의 마이크로러닝 복습 엔진.
// 백엔드와 무관하게 순수 함수로 구현하여 로컬에서 예측 가능하게 동작한다.

export type Grade = 'again' | 'hard' | 'good' | 'easy';

export interface SrsCardState {
  /** Leitner 박스 단계 (0=방금 배움 ~ 5=장기기억) */
  box: number;
  /**
   * 이 카드의 '쉬움 계수'(SM-2 의 ease factor). 같은 박스라도 사람마다·카드마다
   * 체감 난이도가 다르므로, 반복 성적에 따라 간격을 늘리거나 좁힌다.
   *  · 이해했어요가 쌓이면 조금씩 올라가 복습 주기가 길어지고,
   *  · 다시 볼래요가 반복되면 내려가 더 자주 만나게 된다.
   * 기존 저장 데이터에는 없을 수 있어 선택 필드로 두고 DEFAULT_EASE 로 보정한다.
   */
  ease?: number;
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
/**
 * 오답(again) 카드 재배치 간격 — 간격 학습(Spaced Repetition) 원리에 따라
 * 3학습일 뒤에 다시 노출한다(운영 의도: 망각 곡선 반영·복습 자동 정렬).
 */
export const AGAIN_REPOSITION_DAYS = 3;
const AGAIN_REPOSITION_MS = AGAIN_REPOSITION_DAYS * DAY;

/** 쉬움 계수 기본값·범위 — SM-2 관례를 따르되 마이크로러닝에 맞게 폭을 좁혔다. */
export const DEFAULT_EASE = 2.5;
export const MIN_EASE = 1.3;
export const MAX_EASE = 2.8;

/** 반복해서 잊는 카드(누적 망각 2회 이상)는 3일을 기다리지 않고 다음 날 다시 만난다. */
export const FREQUENT_LAPSE_THRESHOLD = 2;

const clampEase = (e: number) => Math.max(MIN_EASE, Math.min(MAX_EASE, e));

/** 저장된 상태에서 쉬움 계수를 안전하게 읽는다(구버전 데이터 호환). */
export function easeOf(state: Pick<SrsCardState, 'ease'>): number {
  return typeof state.ease === 'number' && Number.isFinite(state.ease) ? clampEase(state.ease) : DEFAULT_EASE;
}

/** 박스 단계 → 다음 간격(ms). */
export function boxIntervalMs(box: number): number {
  const clamped = Math.max(0, Math.min(MAX_BOX, box));
  const days = BOX_INTERVAL_DAYS[clamped];
  return days === 0 ? AGAIN_DELAY : days * DAY;
}

export function initialState(now: number = Date.now()): SrsCardState {
  return { box: 0, ease: DEFAULT_EASE, dueAt: now, reps: 0, lapses: 0, lastGrade: null, lastReviewedAt: null };
}

/**
 * 채점 결과에 따라 다음 상태를 계산한다.
 *
 * 박스(Leitner)로 큰 틀의 간격을 잡고, 쉬움 계수(ease)로 사람·카드별 편차를 보정한다.
 *  - again('다음에 한번 더 볼게요'): 박스 0 으로 강등 + 계수 하락. 처음 잊었으면 3학습일 뒤,
 *    이미 여러 번 잊은 카드라면 다음 날 바로 다시 만난다(자주 틀리는 것을 더 자주).
 *  - hard : 현재 간격의 절반(최소 1일), 박스 유지 + 계수 소폭 하락
 *  - good('이해했어요'): 박스 +1, 표준 간격 × 계수, 계수 소폭 상승
 *  - easy : 박스 +2, 더 긴 간격 × 계수, 계수 상승
 */
export function schedule(prev: SrsCardState, grade: Grade, now: number = Date.now()): SrsCardState {
  const prevEase = easeOf(prev);
  const base = { ...prev, reps: prev.reps + 1, lastGrade: grade, lastReviewedAt: now };

  switch (grade) {
    case 'again': {
      const lapses = prev.lapses + 1;
      const ease = clampEase(prevEase - 0.22);
      // 반복해서 잊는 카드는 3일을 기다리지 않고 더 빨리 다시 노출한다.
      const wait = lapses >= FREQUENT_LAPSE_THRESHOLD ? DAY : AGAIN_REPOSITION_MS;
      return { ...base, box: 0, ease, lapses, dueAt: now + wait };
    }
    case 'hard': {
      const box = Math.max(1, prev.box);
      const ease = clampEase(prevEase - 0.12);
      const interval = Math.max(DAY, Math.round(boxIntervalMs(box) * 0.5 * (ease / DEFAULT_EASE)));
      return { ...base, box, ease, dueAt: now + interval };
    }
    case 'good': {
      const box = Math.min(MAX_BOX, prev.box + 1);
      const ease = clampEase(prevEase + 0.06);
      const interval = Math.round(boxIntervalMs(box) * (ease / DEFAULT_EASE));
      return { ...base, box, ease, dueAt: now + interval };
    }
    case 'easy': {
      const box = Math.min(MAX_BOX, prev.box + 2);
      const ease = clampEase(prevEase + 0.15);
      const interval = Math.round(boxIntervalMs(box) * (ease / DEFAULT_EASE));
      return { ...base, box, ease, dueAt: now + interval };
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
