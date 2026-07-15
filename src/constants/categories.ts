import type { Ionicons } from '@expo/vector-icons';
import type { CardCategory } from '../domain/models/LearningCard';

type IconName = keyof typeof Ionicons.glyphMap;

// 안전점검 대분류별 아이콘/컬러 — 대시보드·카드·엠블럼에서 공통 사용.
export const CATEGORY_ICON: Record<CardCategory, IconName> = {
  '전기 위험': 'flash',
  '공정 위험': 'color-fill',
  위험물: 'flame',
  '현장 점검': 'camera',
};

export const CATEGORY_COLOR: Record<CardCategory, string> = {
  '전기 위험': '#F2B705',
  '공정 위험': '#5C6BC0',
  위험물: '#E2574C',
  '현장 점검': '#0EA5E9',
};

/** 대분류 → 중분류 목록 (필터·탐색 UI 용). */
export const CATEGORY_TREE: Record<CardCategory, string[]> = {
  '전기 위험': ['배선설비'],
  '공정 위험': ['도장 공정'],
  위험물: ['기타'],
  '현장 점검': ['방폭 전기설비', '건축 방화', '소방설비', '정전기 관리', '위험물 설비', '피난설비'],
};

export const ALL_CATEGORIES = Object.keys(CATEGORY_ICON) as CardCategory[];

export function getCategoryColor(label: string): string | undefined {
  return (CATEGORY_COLOR as Record<string, string>)[label];
}

export function getCategoryIcon(label: string): IconName {
  return (CATEGORY_ICON as Record<string, IconName>)[label] ?? 'document-text';
}
