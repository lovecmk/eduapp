// 오늘의 안전 상식 — 매일 바뀌는 짧은 교육 콘텐츠(체류·복귀 유도 + 추가 학습).
export interface SafetyTip {
  title: string;
  body: string;
  category: string;
}

export const SAFETY_TIPS: SafetyTip[] = [
  { category: '소방', title: '소화기 유효기간, 확인하셨나요?', body: '분말소화기 내용연수는 10년입니다. 지시압력계 바늘이 녹색 범위를 벗어나면 즉시 점검·교체하세요.' },
  { category: '건축', title: '균열 폭 0.3mm의 의미', body: '콘크리트 균열 폭 0.3mm는 철근 부식이 시작되는 경계값입니다. 이상이면 진행성 여부를 계측해야 해요.' },
  { category: '전기', title: '누전차단기 월 1회 테스트', body: '분전반의 테스트 버튼을 눌러 정상 차단되는지 매월 확인하세요. 동작하지 않으면 감전·화재 위험이 큽니다.' },
  { category: '승강기', title: '승강기 안전검사증 위치', body: '승강기 내부에는 유효기간이 표시된 검사합격증명서가 게시되어야 합니다. 만료 시 운행을 중지해야 해요.' },
  { category: '기계설비', title: '저수조는 반기 1회 청소', body: '급수 저수조는 연 2회 이상 청소·수질검사가 의무입니다. 월류관 방충망 파손도 함께 확인하세요.' },
  { category: '구조', title: '철근 피복두께가 중요한 이유', body: '피복두께가 부족하면 철근이 빨리 부식되어 구조물 수명이 급격히 줄어듭니다. 노출부는 40mm 이상을 확보하세요.' },
  { category: '소방', title: '유도등은 정전 후 20분', body: '유도등은 상용전원 차단 시 예비전원으로 20분 이상 켜져 있어야 합니다. 지하상가 등은 60분이 필요해요.' },
];

/** 날짜 기준으로 오늘의 팁을 결정(매일 순환). */
export function getTodayTip(): SafetyTip {
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  return SAFETY_TIPS[dayIndex % SAFETY_TIPS.length];
}
