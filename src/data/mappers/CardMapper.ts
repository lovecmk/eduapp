import type { CardDTO } from '../dto/CardDTO';
import type { LearningCard, CardCategory, CardStatus } from '../../domain/models/LearningCard';

const CATEGORY_MAP: Record<string, CardCategory> = {
  ELEC: '전기 위험',
  PROCESS: '공정 위험',
  HAZMAT: '위험물',
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

const CARD_TYPE_MAP: Record<string, 'explanation' | 'ox' | 'choice'> = {
  EXPLANATION: 'explanation',
  OX: 'ox',
  CHOICE: 'choice',
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
      category: CATEGORY_MAP[dto.category_cd] ?? '전기 위험',
      subCategory: dto.sub_category_nm?.trim() ?? '',
      topic: dto.topic_nm?.trim() ?? '',
      keywords: dto.keywords ?? [],
      title: dto.title_txt?.trim() ?? '',
      difficulty: DIFFICULTY_MAP[dto.difficulty_cd ?? 'MEDIUM'] ?? 'medium',
      studySeconds: dto.study_seconds ?? 40,
      situation: dto.situation_txt?.trim() ?? '',
      question: dto.question_txt?.trim() ?? '',
      imageUrl: dto.image_url?.trim() || undefined,
      principle: dto.principle_txt?.trim() ?? '',
      process: dto.process_txt?.trim() || undefined,
      fireTriangle: dto.fire_triangle_txt?.trim() || undefined,
      conclusion: dto.conclusion_txt?.trim() ?? '',
      source: dto.source_txt?.trim() || undefined,
      type: CARD_TYPE_MAP[dto.card_type_cd ?? 'EXPLANATION'] ?? 'explanation',
      choices: dto.choices,
      answerIndex: dto.answer_index,
      hasImage: Boolean(dto.image_url?.trim()),
      status: STATUS_MAP[dto.status_cd] ?? 'new',
      dueAt: dto.due_at ? new Date(dto.due_at) : null,
    };
  }

  static toDomainList(dtos: CardDTO[]): LearningCard[] {
    return dtos.map(CardMapper.toDomain);
  }
}
