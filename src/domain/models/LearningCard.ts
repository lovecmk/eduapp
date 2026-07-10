// 학습카드 도메인 모델 — 현장 안전 학습 카드
export type CardCategory = '소방' | '전기' | '추락' | '화학' | '기계';
export type CardStatus = 'new' | 'learning' | 'mastered';
export type CardDifficulty = 'easy' | 'medium' | 'hard';

export interface LearningCard {
  id: string;
  category: CardCategory;
  difficulty: CardDifficulty;
  question: string;
  answer: string;
  explanation: string;
  highlights?: string[];
  standards?: string[];
  status: CardStatus;
  dueAt: Date | null;
}
