import type { CardDTO } from '../dto/CardDTO';
import type { LearningCard, CardCategory, CardStatus } from '../../domain/models/LearningCard';
import { parseDate } from './_date';
import { logger } from '../../utils/logger';

/**
 * 서버 분류 코드 → 앱 대분류.
 *
 * ── 표가 서버 코드보다 짧으면 무슨 일이 일어나는가 ────────────────────────
 * 서버의 문제 분류는 **공식 분류체계 8종**이다(BE `domain.CardCategories`:
 * 소방시설 FIRE · 전기설비 ELEC · 위험물 HAZMAT · 공정설비 PROCESS ·
 * 연소확대방지시설 SPREAD · 피난시설 EGRESS · 배터리화재 BATTERY · 기타 ETC).
 * 앱이 그리는 대분류는 넷뿐이고, 아이콘·색·도감 500종·엠블럼이 전부 그 넷을
 * 축으로 짜여 있어 여기서 접는다.
 *
 * 표에 없는 코드는 아래에서 '전기 위험'으로 폴백한다 — **조용한 폴백이라
 * 위험하다.** 스튜디오에서 검수를 통과한 문제 9건 중 7건이 소방시설, 2건이
 * 피난시설인데, 그 코드들이 이 표에 없던 동안에는 아홉 장이 전부 '전기 위험'
 * 으로 보였다. 오류는 나지 않는다 — 화면이 조용히 거짓말을 한다.
 *
 * ── 접는 방향의 근거 ──────────────────────────────────────────────────────
 * `CATEGORY_TREE['현장 점검']`(constants/categories.ts)에 이미 '소방설비'·
 * '피난설비'·'건축 방화'가 중분류로 들어 있다. 시설 계열을 현장 점검으로 모으는
 * 것은 이 앱이 원래 의도한 구조다.
 *
 * 배터리화재만 전기 쪽으로 보낸다 — 리튬이온 화재의 발화 원인은 전기적이고,
 * 그 문제를 '현장 점검'에서 만나면 학습자가 분야를 오해한다.
 *
 * **BE `domain.appCategoryByCode`(daily3min/domain/category.go)와 같은 값이어야
 * 한다.** 두 표가 갈리면 서버가 센 분야별 통계·엠블럼과 앱이 그린 카드의 분야가
 * 어긋나고, 그때는 어느 쪽이 맞는지 아무도 모른다.
 */
const CATEGORY_MAP: Record<string, CardCategory> = {
  ELEC: '전기 위험',
  BATTERY: '전기 위험',
  PROCESS: '공정 위험',
  HAZMAT: '위험물',
  FIELD: '현장 점검',
  FIRE: '현장 점검',
  EGRESS: '현장 점검',
  SPREAD: '현장 점검',
  ETC: '현장 점검',
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
