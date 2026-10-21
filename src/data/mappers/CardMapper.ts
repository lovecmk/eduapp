import { choiceQuestionError, isSingleChoiceFormat } from '../../constants/choiceQuestion';
import type { CardDTO } from '../dto/CardDTO';
import type { LearningCard, CardCategory, CardStatus } from '../../domain/models/LearningCard';
import { parseDate } from './_date';
import { logger } from '../../utils/logger';
import { ApiError } from '../network/errors';
import { validateArray } from '../network/validation';

/** Backend AppCategoryOf와 같은 집계 방향. 실제 기술 분류는 별도 보존한다. */
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
  HOTWORK: '공정 위험', GAS: '위험물', FIREBASIC: '현장 점검', SAFEMGMT: '현장 점검',
  SMOKE: '현장 점검', EXTING: '현장 점검', WATEREXT: '현장 점검', GASEXT: '현장 점검',
  ALARM: '현장 점검', FIREACT: '현장 점검', RISK_MGMT: '현장 점검', LANGUAGE: '현장 점검', WORK: '현장 점검',
  '전기 위험': '전기 위험', '공정 위험': '공정 위험', '위험물': '위험물', '현장 점검': '현장 점검',
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

function codeValue<T extends string>(map: Record<string, T>, code: unknown, fallback: T): T {
  return typeof code === 'string' && Object.prototype.hasOwnProperty.call(map, code) ? map[code] : fallback;
}

/**
 * 값이 비어 있는가 — **문자열 'null' 도 비어 있는 것으로 본다.**
 *
 * 문제 원본(엑셀 → BE 생성기 → cards_seed.json → DB)은 값이 없는 선택 항목을
 * 빈 칸이 아니라 **문자열 'null'** 로 흘려보낸다. 같은 함정을 시드 생성기
 * (scripts/build-card-seed.mjs)가 이미 한 번 밟았고 거기서는 걸러 냈는데,
 * 서버에서 그대로 내려오는 이 경로에는 그 방어가 없었다.
 *
 * 그대로 두면 사진이 없는 카드가 `imageUrl: 'null'` 을 갖는다. 그 값은
 * hasCardImage 를 통과하므로 학습 화면에 사진 칸이 열리고, resolveCardImage 는
 * 풀지 못하므로 그 칸에는 '불러올 수 없어요'가 뜬다 — 사진이 애초에 없는
 * 카드마다 매번. 사용자는 앱이 사진을 잃어버렸다고 읽는다.
 */
function blank(value: string | null | undefined): boolean {
  const v = typeof value === 'string' ? value.trim() : '';
  return v === '' || v.toLowerCase() === 'null' || v.toLowerCase() === 'undefined';
}

/** 선택 항목 — 없거나 'null' 이면 undefined. 주소·본문 모두 같은 규칙을 쓴다. */
function optional(value: string | null | undefined): string | undefined {
  return blank(value) ? undefined : value!.trim();
}

/**
 * 이 카드를 퀴즈로 낼 수 있는가 — 보기와 정답이 **둘 다** 성립할 때만이다.
 *
 * 학습 화면은 퀴즈 카드를 풀기 전에는 뒤집지도, 넘기지도 못하게 막는다
 * (`onCardPress`·`trySwipe`). 그래서 보기가 비어 있는 퀴즈 카드가 한 장 섞이면
 * 화면에는 고를 것이 하나도 없는데 넘어갈 수도 없다 — **그날 학습이 그 자리에서
 * 멈춘다.** 나가는 것 말고는 길이 없고, 다음 날에도 같은 카드가 나온다.
 *
 * 정답 번호가 없을 때도 조용히 넘어가면 안 된다. 예전에는 `answerIndex ?? 0` 이라
 * **①번을 정답으로 꾸며 냈다.** 제대로 고른 사람이 오답 처리되고, 그 결과가 그대로
 * 복습 일정(SRS)에 반영된다. 화면 어디에도 이상하다는 표시는 없다.
 *
 * 둘 중 하나라도 어긋나면 설명형 카드로 낮춰 낸다. 내용은 그대로 읽히고, 채점만
 * 하지 않는다 — 없는 정답으로 채점하는 것보다 정직하다. 콘텐츠가 깨졌다는 사실은
 * 구조화 로그로 남겨 운영이 찾을 수 있게 한다.
 */
function quizIsAnswerable(dto: CardDTO): boolean {
  const choices = dto.choices ?? [];
  const answer = dto.answer_index;
  const valid = (
    Array.isArray(choices) && choices.length >= 2 && choices.every((v) => typeof v === 'string' && !!v.trim()) &&
    (dto.card_type_cd !== 'OX' || (choices.length === 2 && choices[0] === 'O' && choices[1] === 'X')) &&
    typeof answer === 'number' &&
    Number.isInteger(answer) &&
    answer >= 0 &&
    answer < choices.length
  );
  if (!valid) return false;
  if (isSingleChoiceFormat(dto.format_nm ?? '')) {
    return dto.card_type_cd === 'CHOICE' && typeof dto.answer_txt === 'string' &&
      !choiceQuestionError(dto.format_nm!, choices, dto.answer_txt, typeof dto.situation_txt === 'string' ? dto.situation_txt : '') &&
      typeof dto.question_txt === 'string' && !!dto.question_txt.trim() && dto.answer_txt.trim() === choices[answer!].trim();
  }
  if (typeof dto.format_nm === 'string' && dto.format_nm.trim() === '빈칸형') {
    // Never record a quiz grade when the canonical answer contradicts its index.
    return dto.card_type_cd === 'CHOICE' && choices.length === 2 &&
      choices[0].trim() !== choices[1].trim() &&
      typeof dto.question_txt === 'string' &&
      (dto.question_txt.match(/\[빈칸\]|\[\s*\]|_{2,}|[（(]\s*[)）]/g) ?? []).length === 1 &&
      typeof dto.answer_txt === 'string' && dto.answer_txt.trim() === choices[answer!].trim();
  }
  return true;
}

export class CardMapper {
  static toDomain(dto: CardDTO): LearningCard {
    if (!dto || typeof dto !== 'object' || typeof dto.id !== 'string' || !dto.id.trim()) {
      throw new ApiError(502, '학습카드 응답 형식이 올바르지 않습니다', 'server');
    }
    const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
    // 알 수 없는 코드는 폴백하되(화면은 계속 뜬다) 스키마 불일치를 구조화 로그로 남긴다.
    if (!CATEGORY_MAP[dto.category_cd]) {
      logger.warn('dto_unknown_code', { mapper: 'card', field: 'category_cd', value: dto.category_cd });
    }
    if (!STATUS_MAP[dto.status_cd]) {
      logger.warn('dto_unknown_code', { mapper: 'card', field: 'status_cd', value: dto.status_cd });
    }
    const declaredType = codeValue(CARD_TYPE_MAP, dto.card_type_cd, 'explanation');
    const answerable = declaredType === 'explanation' || quizIsAnswerable(dto);
    if (!answerable) {
      logger.warn('card_quiz_unanswerable', {
        cardId: dto.id,
        type: dto.card_type_cd,
        choices: (dto.choices ?? []).length,
        answerIndex: dto.answer_index,
      });
    }

    return {
      id: dto.id,
      groupCode: optional(dto.group_cd),
      taxonomyCategoryCode: optional(dto.taxonomy_category_cd),
      taxonomyCategory: optional(dto.taxonomy_category_nm),
      category: codeValue(CATEGORY_MAP, dto.category_cd, '현장 점검'),
      subCategory: text(dto.sub_category_nm),
      topic: text(dto.topic_nm),
      keywords: Array.isArray(dto.keywords) ? dto.keywords.filter((v) => typeof v === 'string') : [],
      industry: optional(dto.industry_nm),
      title: text(dto.title_txt),
      format: optional(dto.format_nm),
      difficulty: codeValue(DIFFICULTY_MAP, dto.difficulty_cd, 'medium'),
      studySeconds: typeof dto.study_seconds === 'number' && Number.isFinite(dto.study_seconds) && dto.study_seconds > 0 ? dto.study_seconds : 40,
      situation: text(dto.situation_txt),
      question: text(dto.question_txt),
      imageUrl: optional(dto.image_url),
      principle: optional(dto.principle_txt) ?? '',
      // 선택 본문도 같은 규칙으로 읽는다 — 'null' 이 그대로 통과하면 해설에
      // "null" 이라고 적힌 단계가 그려진다(사진에서 이미 겪은 것과 같은 원인).
      process: optional(dto.process_txt),
      fireTriangle: optional(dto.fire_triangle_txt),
      conclusion: optional(dto.conclusion_txt) ?? (declaredType === 'ox' ? '' : optional(dto.answer_txt)) ?? '',
      answer: optional(dto.answer_txt),
      improvement: optional(dto.improvement_txt),
      answerImageUrl: optional(dto.answer_image_url),
      source: optional(dto.source_txt),
      note: optional(dto.note_txt),
      // 풀 수 없는 퀴즈는 설명형으로 낮춘다(위 quizIsAnswerable 주석 참고).
      type: answerable ? declaredType : 'explanation',
      choices: answerable && declaredType !== 'explanation' ? dto.choices : undefined,
      answerIndex: answerable && declaredType !== 'explanation' ? dto.answer_index : undefined,
      // 문제 사진이든 해설 사진이든 하나라도 있으면 '사진 있는 카드'다
      // (시드 생성기가 세는 방식과 같다 — 두 곳이 갈리면 목록과 상세가 어긋난다).
      hasImage: !blank(dto.image_url) || !blank(dto.answer_image_url),
      status: codeValue(STATUS_MAP, dto.status_cd, 'new'),
      dueAt: parseDate(dto.due_at),
    };
  }

  static toDomainList(dtos: CardDTO[]): LearningCard[] {
    return validateArray<CardDTO>(dtos).map(CardMapper.toDomain);
  }
}
