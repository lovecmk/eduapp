// 하루 학습 할당량 도메인 모델.
// '신규 카드 학습'은 하루 상한이 있고(운영 지속가능성), '복습'은 자유다.
// 이 값의 원천(源)은 서버가 되어야 정확하다(기기 여러 대·시간대 문제 방지).
// 오프라인/목업에서는 로컬 스토어(dailyLearningStore)가 임시 원천 역할을 한다.
export interface LearningQuota {
  /** 오늘 신규 학습 상한. */
  limit: number;
  /** 오늘 이미 학습한 신규 카드 수. */
  used: number;
  /** 남은 신규 학습 수(= max(0, limit - used)). */
  remaining: number;
  /** 상한이 초기화되는 시각(다음 날 자정) ISO. */
  resetsAt: string;
}

/** 화면이 실제로 보는 값 — 서버와 로컬을 합친 결과. */
export interface ResolvedQuota {
  limit: number;
  used: number;
  remaining: number;
  canLearn: boolean;
}

/**
 * 서버 할당량과 로컬 진행을 합친다.
 *
 * ── 상한은 서버가 정한다 ─────────────────────────────────────────────
 * 관리자가 콘솔에서 "오늘은 2장으로 줄이자"라고 바꾸면 그 값이 여기로 온다.
 * 서버가 값을 주지 못했을 때만 앱 상수로 떨어진다(오프라인에서 학습이 막히면 안 된다).
 *
 * ── 사용량은 둘 중 큰 쪽 ─────────────────────────────────────────────
 *  · 로컬 — 방금 푼 카드가 즉시 반영된다(오프라인에서도).
 *  · 서버 — 다른 기기에서 푼 것까지 안다(현장 태블릿은 여럿이 돌려 쓴다).
 *
 * 작은 쪽을 쓰면 상한을 넘겨 학습할 수 있게 되고, 큰 쪽을 쓰면 기껏해야 그날의
 * 신규 학습이 조금 일찍 닫힌다. 어느 쪽으로 기울어야 하는지는 분명하다.
 */
export function resolveDailyQuota(
  localUsed: number,
  server: LearningQuota | undefined,
  fallbackLimit: number,
): ResolvedQuota {
  // 0 이나 음수는 '무제한'이 아니라 실수다. 그대로 쓰면 학습이 통째로 잠긴다.
  const limit = server && server.limit > 0 ? server.limit : fallbackLimit;
  const used = Math.max(Math.max(0, localUsed), Math.max(0, server?.used ?? 0));
  const remaining = Math.max(0, limit - used);
  return { limit, used, remaining, canLearn: remaining > 0 };
}
