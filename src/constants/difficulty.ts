import type { CardDifficulty } from '../domain/models/LearningCard';
import type { Theme } from '../theme/tokens';

const DIFFICULTY_LABEL: Record<CardDifficulty, string> = {
  easy: '초급',
  medium: '중급',
  hard: '고급',
};

/**
 * 개인별 1회 학습 세션 목표 시간(초) — "하루 3분" 마이크로러닝.
 * 백엔드(`GET /api/cards/today`)가 카드별 study_seconds 합이 이 값에
 * 도달할 때까지 카드를 담아 내려준다. 목업도 동일 규칙을 따른다.
 */
export const STUDY_SESSION_SECONDS = 180;

export function getDifficultyMeta(theme: Theme, difficulty: CardDifficulty | string) {
  const colorByLevel: Record<CardDifficulty, string> = {
    easy: theme.colors.success,
    medium: theme.colors.warning,
    hard: theme.colors.error,
  };
  const key = difficulty as CardDifficulty;
  return {
    label: DIFFICULTY_LABEL[key] ?? '-',
    color: colorByLevel[key] ?? theme.colors.textSecondary,
  };
}
