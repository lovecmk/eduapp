import type { Ionicons } from '@expo/vector-icons';
import type { CardCategory } from '../domain/models/LearningCard';

type IconName = keyof typeof Ionicons.glyphMap;

// 건물점검 대분류별 아이콘/컬러 — 대시보드·카드·엠블럼에서 공통 사용.
export const CATEGORY_ICON: Record<CardCategory, IconName> = {
  건축: 'business',
  구조: 'construct',
  기계설비: 'water',
  전기: 'flash',
  소방: 'flame',
  승강기: 'swap-vertical',
};

export const CATEGORY_COLOR: Record<CardCategory, string> = {
  건축: '#5C6BC0',
  구조: '#8D6E63',
  기계설비: '#26A69A',
  전기: '#F2B705',
  소방: '#E2574C',
  승강기: '#7E57C2',
};

/** 대분류 → 중분류 목록 (필터·탐색 UI 용). */
export const CATEGORY_TREE: Record<CardCategory, string[]> = {
  건축: ['마감·방수', '균열·손상'],
  구조: ['콘크리트', '철골·접합'],
  기계설비: ['급배수', '공조·환기'],
  전기: ['수변전', '배선·접지'],
  소방: ['소화설비', '피난·경보'],
  승강기: ['안전장치', '유지관리'],
};

export const ALL_CATEGORIES = Object.keys(CATEGORY_ICON) as CardCategory[];

export function getCategoryColor(label: string): string | undefined {
  return (CATEGORY_COLOR as Record<string, string>)[label];
}

export function getCategoryIcon(label: string): IconName {
  return (CATEGORY_ICON as Record<string, IconName>)[label] ?? 'document-text';
}
