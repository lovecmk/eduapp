import type { Ionicons } from '@expo/vector-icons';
import type { CardCategory } from '../domain/models/LearningCard';

type IconName = keyof typeof Ionicons.glyphMap;

export const CATEGORY_ICON: Record<CardCategory, IconName> = {
  소방: 'flame',
  전기: 'flash',
  추락: 'warning',
  화학: 'flask',
  기계: 'construct',
};

export const CATEGORY_COLOR: Record<CardCategory, string> = {
  소방: '#E2574C',
  전기: '#F2B705',
  추락: '#3DA5D9',
  화학: '#7B5EA7',
  기계: '#5C6770',
};

export function getCategoryColor(label: string): string | undefined {
  return (CATEGORY_COLOR as Record<string, string>)[label];
}

export function getCategoryIcon(label: string): IconName {
  return (CATEGORY_ICON as Record<string, IconName>)[label] ?? 'document-text';
}
