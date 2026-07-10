import type { CardDifficulty } from '../domain/models/LearningCard';
import type { Theme } from '../theme/tokens';

const DIFFICULTY_LABEL: Record<CardDifficulty, string> = {
  easy: '초급',
  medium: '중급',
  hard: '고급',
};

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
