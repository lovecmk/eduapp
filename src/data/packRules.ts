// 카드팩 획득 조건(back-end 규칙 정의) — 학습/출석/연속/마스터/주간챌린지 등
// 상세 조건을 데이터로 선언하고, 현재 상태(context)로 진행도·수령가능 여부를 평가한다.
// 실서버 전환 시 이 규칙 테이블은 서버(관리 콘솔)에서 내려주는 형태로 대체 가능.
import type { Ionicons } from '@expo/vector-icons';

export type PackRuleType = 'study' | 'streak' | 'attendance' | 'mastery' | 'weekly';

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
}

export interface PackRuleProgress {
  rule: PackRule;
  current: number;
  target: number;
  pct: number;
  /** 지금 수령 가능한 팩 수(0이면 조건 미충족 또는 이미 수령) */
  claimable: number;
  /** 이미 수령한 횟수 */
  claimedTimes: number;
}

// 상세 획득 조건 — 신중히 단계별로 설계(쉬운 것 → 어려운 것).
export const PACK_RULES: PackRule[] = [
  { id: 'study-10', title: '학습 워밍업', desc: '카드 10장 학습하기', icon: 'school', color: '#2563EB', type: 'study', target: 10, reward: 1 },
  { id: 'study-50', title: '학습 러너', desc: '누적 50장 학습마다', icon: 'walk', color: '#0EA5E9', type: 'study', target: 50, reward: 2, repeatable: true },
  { id: 'attend-3', title: '3일 연속 출석', desc: '3일 연속 출석 도장', icon: 'flame', color: '#FF6B35', type: 'streak', target: 3, reward: 1 },
  { id: 'attend-7', title: '개근왕 첫걸음', desc: '7일 연속 출석 도장', icon: 'flame', color: '#EF4444', type: 'streak', target: 7, reward: 2 },
  { id: 'attend-total-30', title: '한 달 출석', desc: '누적 30일 출석', icon: 'ribbon', color: '#22C55E', type: 'attendance', target: 30, reward: 3 },
  { id: 'master-20', title: '안전 지식 마스터', desc: '카드 20장 마스터마다', icon: 'medal', color: '#A855F7', type: 'mastery', target: 20, reward: 2, repeatable: true },
  { id: 'weekly-clear', title: '주간 챌린지 완료', desc: '이번 주 챌린지 달성', icon: 'trophy', color: '#F59E0B', type: 'weekly', target: 1, reward: 1, repeatable: true },
];

function currentFor(rule: PackRule, ctx: PackRuleContext): number {
  switch (rule.type) {
    case 'study': return ctx.studyTotal;
    case 'streak': return ctx.attendanceStreak;
    case 'attendance': return ctx.attendanceTotal;
    case 'mastery': return ctx.masteredCount;
    case 'weekly': return ctx.weeklyCleared ? 1 : 0;
  }
}

/**
 * 규칙 평가 — 현재 상태와 이미 수령한 횟수(claimedTimes)로
 * 각 규칙의 진행도와 지금 수령 가능한 팩 수를 계산한다.
 * 반복형은 target 배수만큼 달성했는데 아직 수령 안 한 만큼을 claimable 로 준다.
 */
export function evaluatePackRules(ctx: PackRuleContext, claimed: Record<string, number>): PackRuleProgress[] {
  return PACK_RULES.map((rule) => {
    const current = currentFor(rule, ctx);
    const claimedTimes = claimed[rule.id] ?? 0;
    const achievedTimes = rule.repeatable ? Math.floor(current / rule.target) : current >= rule.target ? 1 : 0;
    const claimableTimes = Math.max(0, achievedTimes - claimedTimes);
    // 진행바는 "다음 수령까지"를 보여준다.
    const towardNext = rule.repeatable ? current - claimedTimes * rule.target : current;
    const pct = Math.max(0, Math.min(1, towardNext / rule.target));
    return {
      rule,
      current,
      target: rule.target,
      pct,
      claimable: claimableTimes * rule.reward,
      claimedTimes,
    };
  });
}
