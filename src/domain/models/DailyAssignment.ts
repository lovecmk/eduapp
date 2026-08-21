import type { CardDifficulty, LearningCard } from './LearningCard';

/**
 * 오늘 이 사람에게 배정된 학습 한 벌.
 *
 * "매일 3~5문제"라는 이 앱의 약속이 실제로 지켜지는 자리다. 장수는 그날의
 * 난이도가 정하고(쉬우면 5, 어려우면 3), 목록은 사람마다·날마다 다르다.
 *
 * 서버(`GET /inner/api/v1/learning/today`)가 권위를 갖고, 그날 처음 물어본 순간 얼려 둔다 —
 * 관리자가 낮에 문제를 추가·삭제해도 오전에 받은 목록이 오후에 달라지지 않는다.
 */
export interface DailyAssignment {
  /** 날짜 키(YYYY-M-D, month 0-based) — 앱의 dateKey 와 같은 형식. */
  day: string;
  /** 그날 이 사람에게 맞춰 정해진 난이도. */
  difficulty: CardDifficulty;
  /**
   * 난이도가 정한 목표 장수(3~5).
   *
   * `cards.length` 와 따로 두는 이유: 후보가 모자라면 실제 배정이 더 짧을 수 있다.
   * 화면의 "2/5" 에서 5가 이 값이라, 목표를 모르면 진도를 보여줄 수 없다.
   */
  targetCount: number;
  /** 오늘 나가는 문제. 순서에도 뜻이 있다(복습이 앞). */
  cards: DailyCard[];
  /** 그중 오늘 이미 푼 수. */
  doneCount: number;
}

/** 오늘 나가는 문제 한 장. */
export interface DailyCard {
  card: LearningCard;
  /**
   * 새로 배우는 것인가, 복습인가.
   *
   * 화면이 둘을 다르게 안내해야 한다 — 복습을 새 문제처럼 내보이면
   * 사용자는 "같은 문제가 또 나왔다"고 느낀다. 실제로는 그게 목적인데도.
   */
  kind: 'new' | 'review';
  /** 오늘 이미 푼 문제인지(앱을 다시 열었을 때 이어서 하도록). */
  done: boolean;
}

/** 아직 받지 못했을 때의 빈 배정 — 화면이 `?.` 를 반복하지 않게. */
export function emptyAssignment(day: string): DailyAssignment {
  return { day, difficulty: 'easy', targetCount: 0, cards: [], doneCount: 0 };
}
