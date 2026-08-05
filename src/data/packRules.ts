// 카드팩 획득 조건 — 학습/출석/연속/마스터/수집/주간챌린지 등
// 상세 조건을 데이터로 선언하고, 현재 상태(context)로 진행도·수령가능 여부를 평가한다.
// 실서버 전환 시 이 규칙 테이블은 서버(관리 콘솔)에서 내려주는 형태로 대체 가능.
//
// ── 왜 규칙이 여기 있고 화면엔 없나 ─────────────────────────────────────
// 예전에는 화면(pack-rules.tsx)이 `claimRule(id, packs, times)` 로 **줄 팩 수를
// 직접 지정**했다. 스토어는 그 숫자를 그대로 더했다. 즉 화면이 잘못 계산하거나
// 버튼이 두 번 눌리면 팩이 그만큼 더 생겼다 — 보상 규칙에 검증이 없었던 셈이다.
// 지금은 스토어가 이 파일의 `evaluatePackRules` 로 **다시 계산해서** 지급한다.
// 화면은 "이 규칙을 받겠다"고 말할 뿐, 얼마를 받을지는 정하지 못한다.
import type { Ionicons } from '@expo/vector-icons';

export type PackRuleType =
  | 'study'
  | 'streak'
  | 'attendance'
  | 'mastery'
  | 'weekly'
  | 'accuracy'
  | 'collection'
  | 'category';

export interface PackRule {
  id: string;
  title: string;
  desc: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  type: PackRuleType;
  /** 달성 목표 수치(weekly 는 1) */
  target: number;
  /** 달성 시 지급 팩 수 */
  reward: number;
  /** 반복 수령 가능 여부(예: 누적 학습 50장마다) */
  repeatable?: boolean;
  /**
   * 반복형의 최대 수령 횟수. 없으면 무한.
   *
   * 무한 반복은 도감이 500종으로 커진 지금 문제가 된다 — 하루에 몰아서
   * 조건을 채우면 팩이 무한정 쏟아져 수집의 의미가 사라진다.
   */
  maxTimes?: number;
  /** 이 규칙이 요구하는 최소 성실도(정확도 기반 규칙에서 표본이 모자랄 때 잠금) */
  minReps?: number;
}

/** 규칙 평가에 필요한 현재 사용자 상태. */
export interface PackRuleContext {
  /** 누적 학습(적립) 횟수 */
  studyTotal: number;
  /** 현재 연속 출석일 */
  attendanceStreak: number;
  /** 누적 출석일 */
  attendanceTotal: number;
  /** 마스터한 카드 수 */
  masteredCount: number;
  /** 이번 주 챌린지 완료 여부 */
  weeklyCleared: boolean;
  /** 최근 복습 정답률(0~100). 표본이 적으면 minReps 로 잠긴다. */
  accuracyPct: number;
  /** 정답률 계산에 쓰인 복습 횟수 */
  accuracyReps: number;
  /** 도감 수집 종수(고유) */
  collectedCount: number;
  /** 분야별 마스터 카드 수 중 가장 높은 값 */
  bestCategoryMastered: number;
}

export const EMPTY_CONTEXT: PackRuleContext = {
  studyTotal: 0,
  attendanceStreak: 0,
  attendanceTotal: 0,
  masteredCount: 0,
  weeklyCleared: false,
  accuracyPct: 0,
  accuracyReps: 0,
  collectedCount: 0,
  bestCategoryMastered: 0,
};

export interface PackRuleProgress {
  rule: PackRule;
  current: number;
  target: number;
  pct: number;
  /** 지금 수령 가능한 팩 수(0이면 조건 미충족 또는 이미 수령) */
  claimable: number;
  /** 이미 수령한 횟수 */
  claimedTimes: number;
  /** 반복 상한까지 다 받았는지 */
  exhausted: boolean;
  /** 조건이 아직 열리지 않았을 때의 이유(표본 부족 등) */
  lockedReason?: string;
}

// ── 상세 획득 조건 ──────────────────────────────────────────────────────
// 쉬운 것 → 어려운 것 순. 500종 도감을 염두에 두고 '오래 가는 사다리'로 짰다.
//
// 지급 총량 감각: 아래 규칙을 전부 소진해도 대략 90팩(=360장) 남짓이다.
// 도감을 다 채우려면 그 위에 매일의 학습·출석 적립과 조각 교환이 필요하다.
export const PACK_RULES: PackRule[] = [
  // 입문 — 앱을 써 보게 만드는 구간
  { id: 'study-10', title: '학습 워밍업', desc: '카드 10장 학습하기', icon: 'school', color: '#2563EB', type: 'study', target: 10, reward: 1 },
  { id: 'attend-3', title: '3일 연속 출석', desc: '3일 연속 출석 도장', icon: 'flame', color: '#FF6B35', type: 'streak', target: 3, reward: 1 },

  // 지속 — 매일 조금씩이 쌓이는 구간
  { id: 'study-50', title: '학습 러너', desc: '누적 50장 학습마다', icon: 'walk', color: '#0EA5E9', type: 'study', target: 50, reward: 2, repeatable: true, maxTimes: 20 },
  { id: 'attend-7', title: '개근왕 첫걸음', desc: '7일 연속 출석 도장', icon: 'flame', color: '#EF4444', type: 'streak', target: 7, reward: 2 },
  { id: 'attend-30-streak', title: '한 달 개근', desc: '30일 연속 출석 도장', icon: 'bonfire', color: '#DC2626', type: 'streak', target: 30, reward: 5 },
  { id: 'attend-total-30', title: '한 달 출석', desc: '누적 30일 출석', icon: 'ribbon', color: '#22C55E', type: 'attendance', target: 30, reward: 3 },
  { id: 'attend-total-100', title: '백일의 성실', desc: '누적 100일 출석', icon: 'medal', color: '#16A34A', type: 'attendance', target: 100, reward: 6 },
  { id: 'weekly-clear', title: '주간 챌린지 완료', desc: '이번 주 챌린지 달성', icon: 'trophy', color: '#F59E0B', type: 'weekly', target: 1, reward: 1, repeatable: true, maxTimes: 52 },

  // 실력 — '많이'가 아니라 '제대로'를 보는 구간
  { id: 'master-20', title: '안전 지식 마스터', desc: '카드 20장 마스터마다', icon: 'medal', color: '#A855F7', type: 'mastery', target: 20, reward: 2, repeatable: true, maxTimes: 15 },
  { id: 'accuracy-80', title: '정확한 복습', desc: '복습 정답률 80% 이상', icon: 'checkmark-done', color: '#0D9488', type: 'accuracy', target: 80, reward: 3, minReps: 30 },
  { id: 'accuracy-90', title: '흔들림 없는 실력', desc: '복습 정답률 90% 이상', icon: 'shield-checkmark', color: '#0F766E', type: 'accuracy', target: 90, reward: 5, minReps: 60 },
  { id: 'category-30', title: '분야 전문가', desc: '한 분야에서 30장 마스터', icon: 'briefcase', color: '#7C3AED', type: 'category', target: 30, reward: 4 },

  // 수집 — 도감이 500종이 된 만큼 긴 사다리를 놓는다
  { id: 'collect-50', title: '도감 채우기 I', desc: '안전 카드 50종 수집', icon: 'albums', color: '#3B82F6', type: 'collection', target: 50, reward: 2 },
  { id: 'collect-150', title: '도감 채우기 II', desc: '안전 카드 150종 수집', icon: 'albums', color: '#6366F1', type: 'collection', target: 150, reward: 4 },
  { id: 'collect-300', title: '도감 채우기 III', desc: '안전 카드 300종 수집', icon: 'albums', color: '#8B5CF6', type: 'collection', target: 300, reward: 8 },
  { id: 'collect-500', title: '도감 완성', desc: '안전 카드 500종 전부 수집', icon: 'diamond', color: '#22D3EE', type: 'collection', target: 500, reward: 20 },
];

function currentFor(rule: PackRule, ctx: PackRuleContext): number {
  switch (rule.type) {
    case 'study': return ctx.studyTotal;
    case 'streak': return ctx.attendanceStreak;
    case 'attendance': return ctx.attendanceTotal;
    case 'mastery': return ctx.masteredCount;
    case 'weekly': return ctx.weeklyCleared ? 1 : 0;
    case 'accuracy': return ctx.accuracyPct;
    case 'collection': return ctx.collectedCount;
    case 'category': return ctx.bestCategoryMastered;
  }
}

/** 표본이 모자라 아직 판정할 수 없는 규칙인지. */
function lockedReason(rule: PackRule, ctx: PackRuleContext): string | undefined {
  if (rule.minReps && ctx.accuracyReps < rule.minReps) {
    return `복습 ${rule.minReps - ctx.accuracyReps}회 더 하면 판정돼요`;
  }
  return undefined;
}

/**
 * 규칙 평가 — 현재 상태와 이미 수령한 횟수(claimedTimes)로
 * 각 규칙의 진행도와 지금 수령 가능한 팩 수를 계산한다.
 * 반복형은 target 배수만큼 달성했는데 아직 수령 안 한 만큼을 claimable 로 준다.
 *
 * **이 함수가 보상액의 유일한 출처다.** 화면도, 스토어도 여기서 나온 숫자만 쓴다.
 */
export function evaluatePackRules(ctx: PackRuleContext, claimed: Record<string, number>): PackRuleProgress[] {
  return PACK_RULES.map((rule) => evaluateRule(rule, ctx, claimed[rule.id] ?? 0));
}

/** 규칙 하나를 평가한다. 스토어가 수령 시 재검증할 때 쓴다. */
export function evaluateRule(rule: PackRule, ctx: PackRuleContext, claimedTimes: number): PackRuleProgress {
  const current = currentFor(rule, ctx);
  const locked = lockedReason(rule, ctx);

  const rawAchieved = locked
    ? 0
    : rule.repeatable
      ? Math.floor(current / rule.target)
      : current >= rule.target
        ? 1
        : 0;
  // 반복 상한을 넘겨 받을 수는 없다 — 무한 지급 구멍을 막는다.
  const cap = rule.repeatable ? (rule.maxTimes ?? Number.MAX_SAFE_INTEGER) : 1;
  const achievedTimes = Math.min(rawAchieved, cap);
  const claimableTimes = Math.max(0, achievedTimes - claimedTimes);

  // 진행바는 "다음 수령까지"를 보여준다.
  const towardNext = rule.repeatable ? current - claimedTimes * rule.target : current;
  const pct = locked ? 0 : Math.max(0, Math.min(1, towardNext / rule.target));

  return {
    rule,
    current,
    target: rule.target,
    pct,
    claimable: claimableTimes * rule.reward,
    claimedTimes,
    exhausted: claimedTimes >= cap,
    lockedReason: locked,
  };
}

/** 규칙 id → 규칙. 스토어의 재검증이 쓴다(모르는 id는 지급하지 않는다). */
export const PACK_RULE_BY_ID: Record<string, PackRule> = Object.fromEntries(PACK_RULES.map((r) => [r.id, r]));
