// 학습카드 도메인 모델 — 건물점검자 대상 안전·점검 학습 카드
// 카테고리는 대분류(category) → 중분류(subCategory) → 소분류(topic) 3단 계층으로 구성된다.
export type CardCategory = '건축' | '구조' | '기계설비' | '전기' | '소방' | '승강기';
export type CardStatus = 'new' | 'learning' | 'mastered';
export type CardDifficulty = 'easy' | 'medium' | 'hard';

export interface LearningCard {
  id: string;
  /** 대분류 */
  category: CardCategory;
  /** 중분류 (예: 소방 > 소화설비) */
  subCategory: string;
  /** 소분류 (예: 소화설비 > 옥내소화전) */
  topic: string;
  difficulty: CardDifficulty;
  question: string;
  answer: string;
  explanation: string;
  /** 이미지 문제일 경우 도해/사진 URL */
  imageUrl?: string;
  highlights?: string[];
  standards?: string[];
  status: CardStatus;
  dueAt: Date | null;
}
