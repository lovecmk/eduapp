import type { CardDTO } from '../dto/CardDTO';
import type { LearningCard, CardCategory, CardStatus } from '../../domain/models/LearningCard';

const CATEGORY_MAP: Record<string, CardCategory> = {
  FIRE: '소방',
  ELEC: '전기',
  FALL: '추락',
  CHEM: '화학',
  MACH: '기계',
};

const STATUS_MAP: Record<CardDTO['status_cd'], CardStatus> = {
  NEW: 'new',
  LEARNING: 'learning',
  MASTERED: 'mastered',
};

const DIFFICULTY_MAP: Record<string, 'easy' | 'medium' | 'hard'> = {
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard',
};

export class CardMapper {
  static toDomain(dto: CardDTO): LearningCard {
    if (__DEV__ && !CATEGORY_MAP[dto.category_cd]) {
      console.warn(`[CardMapper] 알 수 없는 category_cd: ${dto.category_cd} (id=${dto.id})`);
    }
    if (__DEV__ && !STATUS_MAP[dto.status_cd]) {
      console.warn(`[CardMapper] 알 수 없는 status_cd: ${dto.status_cd} (id=${dto.id})`);
    }
    return {
      id: dto.id,
      category: CATEGORY_MAP[dto.category_cd] ?? '소방',
      difficulty: DIFFICULTY_MAP[dto.difficulty_cd ?? 'MEDIUM'] ?? 'medium',
      question: dto.question_txt?.trim() ?? '',
      answer: dto.answer_txt?.trim() ?? '',
      explanation: dto.explanation_txt?.trim() ?? '',
      highlights: dto.highlights,
      standards: dto.standards,
      status: STATUS_MAP[dto.status_cd] ?? 'new',
      dueAt: dto.due_at ? new Date(dto.due_at) : null,
    };
  }

  static toDomainList(dtos: CardDTO[]): LearningCard[] {
    return dtos.map(CardMapper.toDomain);
  }
}
