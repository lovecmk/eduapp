import type { Ionicons } from '@expo/vector-icons';

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * 관심 분야(설비·시설 기준) — 설정에서 사용자가 고르는 개인화 태그.
 * 카드 대분류(CardCategory)와 달리, 실무 현장의 설비/시설 구분을 그대로 따른다.
 */
export const INTEREST_FIELDS = [
  '공정설비',
  '화기시설',
  '전기시설',
  '위험물시설',
  '가스시설',
  '안전관리',
  '연소시설',
  '피난시설',
  '제연시설',
  '소화설비',
  '경보설비',
  '기타설비',
] as const;

export type InterestField = (typeof INTEREST_FIELDS)[number];

/** 관심 분야별 아이콘 — 설정 칩 UI에서 사용. */
export const INTEREST_ICON: Record<InterestField, IconName> = {
  공정설비: 'color-fill',
  화기시설: 'flame',
  전기시설: 'flash',
  위험물시설: 'warning',
  가스시설: 'cloud',
  안전관리: 'shield-checkmark',
  연소시설: 'bonfire',
  피난시설: 'exit',
  제연시설: 'cloudy',
  소화설비: 'water',
  경보설비: 'notifications',
  기타설비: 'ellipsis-horizontal',
};

/** 관심 분야별 강조색 — 칩 활성 상태 표시에 사용. */
export const INTEREST_COLOR: Record<InterestField, string> = {
  공정설비: '#5C6BC0',
  화기시설: '#EF6C00',
  전기시설: '#F2B705',
  위험물시설: '#E2574C',
  가스시설: '#14B8A6',
  안전관리: '#2E9E5B',
  연소시설: '#D84315',
  피난시설: '#0EA5E9',
  제연시설: '#64748B',
  소화설비: '#2563EB',
  경보설비: '#EC4899',
  기타설비: '#94A3B8',
};

/** 문자열이 유효한 관심 분야인지 확인(구버전 저장값 마이그레이션·방어용). */
export function isInterestField(v: unknown): v is InterestField {
  return typeof v === 'string' && (INTEREST_FIELDS as readonly string[]).includes(v);
}
