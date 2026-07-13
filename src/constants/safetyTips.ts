// 오늘의 안전 상식 — 매일 바뀌는 짧은 교육 콘텐츠(체류·복귀 유도 + 추가 학습).
export interface SafetyTip {
  title: string;
  body: string;
  category: string;
}

export const SAFETY_TIPS: SafetyTip[] = [
  { category: '전기 위험', title: '접촉불량, 겉은 멀쩡해도 위험', body: '단자 체결이 느슨하면 접촉저항이 커져 그 부위에서 열이 집중됩니다. 정상 작동해도 내부에서 발열이 쌓일 수 있어요.' },
  { category: '전기 위험', title: '멀티탭 과부하 = 전선 발열', body: '여러 기기를 동시에 쓰면 전류가 늘어 전선이 뜨거워집니다. 차단기가 떨어지기 전에도 피복은 이미 열화될 수 있어요.' },
  { category: '공정 위험', title: '개방된 공간이라도 방심 금물', body: '넓은 곳에서 분무도장을 해도 분무 바로 주변에는 폭발성 분위기가 형성됩니다. 넓다는 이유로 안전하지 않아요.' },
  { category: '공정 위험', title: '배기팬 연동이 중요한 이유', body: '환기와 도장설비가 연동되지 않으면 배기팬이 멈춰도 분무가 계속됩니다. 연동은 고장 시 자동정지로 위험을 막아요.' },
  { category: '위험물', title: '마그네슘 화재에 물은 금물', body: '마그네슘은 물과 반응해 수소를 발생시켜 폭발 위험을 키웁니다. 건조사(마른 모래)로 덮어 질식 소화해야 해요.' },
  { category: '위험물', title: '분진은 바닥보다 공기 중이 위험', body: '금속 분진은 공기 중에 떠 분진운을 형성하면 산소와 넓게 접촉해 분진폭발로 이어질 수 있어요. 매일 청소가 원칙입니다.' },
  { category: '위험물', title: '압축공기로 분진 청소 금지', body: '압축공기로 분진을 불어내면 분진운이 형성돼 폭발 위험이 급증합니다. 불꽃이 튀지 않는 방식으로 처리하세요.' },
];

/** 날짜 기준으로 오늘의 팁을 결정(매일 순환). */
export function getTodayTip(): SafetyTip {
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  return SAFETY_TIPS[dayIndex % SAFETY_TIPS.length];
}
