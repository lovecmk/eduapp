// 카드팩 획득 조건 검사 — 보상은 '많이 주는 것'보다 '틀리게 주지 않는 것'이 중요하다.
import {
  PACK_RULES,
  PACK_RULE_BY_ID,
  EMPTY_CONTEXT,
  evaluatePackRules,
  evaluateRule,
  type PackRuleContext,
} from '../packRules';

const ctx = (over: Partial<PackRuleContext> = {}): PackRuleContext => ({ ...EMPTY_CONTEXT, ...over });

describe('규칙 테이블', () => {
  it('id가 겹치지 않는다', () => {
    expect(new Set(PACK_RULES.map((r) => r.id)).size).toBe(PACK_RULES.length);
    expect(Object.keys(PACK_RULE_BY_ID)).toHaveLength(PACK_RULES.length);
  });

  it('모든 규칙이 양수 목표와 보상을 갖는다', () => {
    for (const r of PACK_RULES) {
      expect(r.target).toBeGreaterThan(0);
      expect(r.reward).toBeGreaterThan(0);
    }
  });

  it('반복형에는 반드시 상한이 있다', () => {
    // 상한 없는 반복은 무한 지급 구멍이다 — 규칙을 새로 추가할 때도 막히게 잠근다.
    for (const r of PACK_RULES) {
      if (r.repeatable) expect(r.maxTimes).toBeGreaterThan(0);
    }
  });

  it('전부 소진해도 지급 총량이 감당할 범위다', () => {
    const total = PACK_RULES.reduce((s, r) => s + r.reward * (r.repeatable ? (r.maxTimes ?? 0) : 1), 0);
    // 500종을 조건 보상만으로 다 채울 수는 없어야 한다(팩당 4장, 중복 감안).
    expect(total).toBeGreaterThan(50);
    expect(total).toBeLessThan(200);
  });
});

describe('진행도 평가', () => {
  it('아무것도 안 했으면 받을 게 없다', () => {
    for (const p of evaluatePackRules(EMPTY_CONTEXT, {})) expect(p.claimable).toBe(0);
  });

  it('단발 규칙은 달성하면 한 번만 받는다', () => {
    const rule = PACK_RULE_BY_ID['study-10'];
    expect(evaluateRule(rule, ctx({ studyTotal: 10 }), 0).claimable).toBe(rule.reward);
    expect(evaluateRule(rule, ctx({ studyTotal: 999 }), 1).claimable).toBe(0);
  });

  it('반복 규칙은 배수만큼 밀린 몫을 준다', () => {
    const rule = PACK_RULE_BY_ID['study-50'];
    // 150장 학습 = 3회분인데 1회만 받았으면 2회분이 남는다.
    expect(evaluateRule(rule, ctx({ studyTotal: 150 }), 1).claimable).toBe(rule.reward * 2);
  });

  it('반복 상한을 넘겨서는 받을 수 없다', () => {
    const rule = PACK_RULE_BY_ID['study-50'];
    const max = rule.maxTimes!;
    // 상한의 두 배를 학습해도 상한까지만.
    const p = evaluateRule(rule, ctx({ studyTotal: rule.target * max * 2 }), 0);
    expect(p.claimable).toBe(rule.reward * max);
    // 상한까지 받았으면 더는 없다.
    expect(evaluateRule(rule, ctx({ studyTotal: rule.target * max * 2 }), max).claimable).toBe(0);
    expect(evaluateRule(rule, ctx({ studyTotal: rule.target * max * 2 }), max).exhausted).toBe(true);
  });
});

describe('정확도 규칙', () => {
  const rule = PACK_RULE_BY_ID['accuracy-80'];

  it('표본이 모자라면 정답률이 높아도 잠긴다', () => {
    // 3번 복습해서 3번 다 맞힌 100%는 실력의 증거가 아니다.
    const p = evaluateRule(rule, ctx({ accuracyPct: 100, accuracyReps: 3 }), 0);
    expect(p.claimable).toBe(0);
    expect(p.lockedReason).toBeTruthy();
    expect(p.pct).toBe(0);
  });

  it('표본이 차면 판정된다', () => {
    const p = evaluateRule(rule, ctx({ accuracyPct: 85, accuracyReps: rule.minReps! }), 0);
    expect(p.lockedReason).toBeUndefined();
    expect(p.claimable).toBe(rule.reward);
  });

  it('표본이 차도 정답률이 낮으면 못 받는다', () => {
    expect(evaluateRule(rule, ctx({ accuracyPct: 79, accuracyReps: 500 }), 0).claimable).toBe(0);
  });
});

describe('수집 규칙', () => {
  it('도감 사다리가 500종까지 이어진다', () => {
    const targets = PACK_RULES.filter((r) => r.type === 'collection').map((r) => r.target);
    expect(targets).toEqual([...targets].sort((a, b) => a - b));
    expect(Math.max(...targets)).toBe(500);
  });

  it('수집 종수가 목표를 넘으면 받을 수 있다', () => {
    const rule = PACK_RULE_BY_ID['collect-150'];
    expect(evaluateRule(rule, ctx({ collectedCount: 149 }), 0).claimable).toBe(0);
    expect(evaluateRule(rule, ctx({ collectedCount: 150 }), 0).claimable).toBe(rule.reward);
  });
});

describe('분야 규칙', () => {
  it('한 분야를 깊게 판 것을 본다(전체 합계가 아니라)', () => {
    const rule = PACK_RULE_BY_ID['category-30'];
    // 총 마스터가 100장이어도 한 분야 최고가 29면 아직이다.
    expect(evaluateRule(rule, ctx({ masteredCount: 100, bestCategoryMastered: 29 }), 0).claimable).toBe(0);
    expect(evaluateRule(rule, ctx({ masteredCount: 30, bestCategoryMastered: 30 }), 0).claimable).toBe(rule.reward);
  });
});
