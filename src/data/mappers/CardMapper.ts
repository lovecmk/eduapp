import type { CardDTO } from '../dto/CardDTO';
import type { LearningCard, CardCategory, CardStatus } from '../../domain/models/LearningCard';

const CATEGORY_MAP: Record<string, CardCategory> = {
  ARCH: '건축',
  STRUCT: '구조',
  MECH: '기계설비',
  ELEC: '전기',
  FIRE: '소방',
  ELEV: '승강기',
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
      category: CATEGORY_MAP[dto.category_cd] ?? '건축',
      subCategory: dto.sub_category_nm?.trim() ?? '',
      topic: dto.topic_nm?.trim() ?? '',
      difficulty: DIFFICULTY_MAP[dto.difficulty_cd ?? 'MEDIUM'] ?? 'medium',
      question: dto.question_txt?.trim() ?? '',
      answer: dto.answer_txt?.trim() ?? '',
      explanation: dto.explanation_txt?.trim() ?? '',
      imageUrl: dto.image_url?.trim() || undefined,
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
