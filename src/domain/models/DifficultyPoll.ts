/** 체감 난이도 투표. */
export type DiffVote = 'easy' | 'normal' | 'hard';
export interface PollCounts { easy: number; normal: number; hard: number }

/**
 * 한 카드의 투표 현황.
 *
 * `counts` 가 null 이면 **다른 사람의 응답을 모을 곳이 없다**는 뜻이다(서버 미배포).
 * 그때 화면은 분포를 그리지 않는다 — 예전에는 카드 id 해시로 "137명 참여 · 34%" 를
 * 지어냈다.
 */
export interface PollSummary {
  counts: PollCounts | null;
  mine: DiffVote | null;
}

export function isDiffVote(v: unknown): v is DiffVote {
  return v === 'easy' || v === 'normal' || v === 'hard';
}
