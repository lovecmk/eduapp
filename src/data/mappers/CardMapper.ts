import type { CardDTO } from '../dto/CardDTO';
import type { LearningCard, CardCategory, CardStatus } from '../../domain/models/LearningCard';
import { parseDate } from './_date';
import { logger } from '../../utils/logger';

const CATEGORY_MAP: Record<string, CardCategory> = {
  ELEC: '전기 위험',
  PROCESS: '공정 위험',
  HAZMAT: '위험물',
  FIELD: '현장 점검',
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
    // 알 수 없는 코드는 폴백하되(화면은 계속 뜬다) 스키마 불일치를 구조화 로그로 남긴다.
    if (!CATEGORY_MAP[dto.category_cd]) {
      logger.warn('dto_unknown_code', { mapper: 'card', field: 'category_cd', value: dto.category_cd });
    }
    if (!STATUS_MAP[dto.status_cd]) {
      logger.warn('dto_unknown_code', { mapper: 'card', field: 'status_cd', value: dto.status_cd });
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
      answerImageUrl: dto.answer_image_url?.trim() || undefined,
      source: dto.source_txt?.trim() || undefined,
      type: CARD_TYPE_MAP[dto.card_type_cd ?? 'EXPLANATION'] ?? 'explanation',
      choices: dto.choices,
      answerIndex: dto.answer_index,
      hasImage: Boolean(dto.image_url?.trim()),
      status: STATUS_MAP[dto.status_cd] ?? 'new',
      dueAt: parseDate(dto.due_at),
    };
  }

  static toDomainList(dtos: CardDTO[]): LearningCard[] {
    return dtos.map(CardMapper.toDomain);
  }
}
