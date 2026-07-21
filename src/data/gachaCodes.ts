// 가챠(카드팩) 교환 코드 카탈로그 — 이벤트/시연용.
// 실서버 전환 시 이 테이블은 서버 검증(POST /api/gacha/redeem)으로 대체된다.
// 코드는 대소문자 구분 없이 비교한다(입력 시 정규화).

export interface GachaCode {
  /** 정규화된 코드(대문자) */
  code: string;
  /** 지급 카드팩 수 */
  packs: number;
  /** 교환 성공 시 안내 문구 */
  label: string;
}

const CODES: GachaCode[] = [
  { code: 'WELCOME', packs: 3, label: '가입 환영 선물 카드팩 3개' },
  { code: 'SAFETY2026', packs: 2, label: '2026 안전 캠페인 카드팩 2개' },
  { code: 'KFPA', packs: 1, label: '브릿지 응원 카드팩 1개' },
  { code: 'FIRE3MIN', packs: 2, label: '매일 3분 챌린지 카드팩 2개' },
];

/** 진행 중인 이벤트 쿠폰 목록(공개용). 실서버 전환 시 GET /api/events 로 대체. */
export function listGachaCodes(): GachaCode[] {
  return CODES;
}

/** 코드 입력값을 정규화(공백 제거·대문자). */
export function normalizeGachaCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '');
}

/** 정규화된 코드로 카탈로그를 조회. 없으면 undefined. */
export function findGachaCode(input: string): GachaCode | undefined {
  const norm = normalizeGachaCode(input);
  return CODES.find((c) => c.code === norm);
}
