// 문제(학습카드) 등록용 작성 초안 — "웹 등록 도구가 내보내는 메타데이터 계약".
// 서버 이관 후에도 이 형태(JSON)를 그대로 POST /inner/api/v1/cards 로 보내면 되도록 단일화한다.
import { ALL_CATEGORIES } from '../../constants/categories';
import type { CardCategory, CardDifficulty, CardType, SeedCard } from './LearningCard';
import { BASE_CARD_FORMATS, SINGLE_CHOICE_FORMATS, choiceQuestionError, isSingleChoiceFormat } from '../../constants/choiceQuestion';

export const AUTHOR_CARD_FORMATS = [...BASE_CARD_FORMATS, ...SINGLE_CHOICE_FORMATS];
export function draftFormat(d: Partial<CardDraft>): string {
  return d.format?.trim() || (d.type === 'ox' ? 'OX형' : d.type === 'choice' ? '' : d.situation?.trim() ? '상황형' : '기초용어형');
}
export function draftType(d: Partial<CardDraft>): CardType {
  const format = draftFormat(d);
  return format === 'OX형' ? 'ox' : format === '빈칸형' || isSingleChoiceFormat(format) ? 'choice' : d.type ?? 'explanation';
}

export interface CardDraft {
  // ── 분류 메타데이터 ──
  category: CardCategory;
  subCategory: string;
  topic: string;
  keywords?: string[];

  // ── 카드 기본 ──
  title: string;
  difficulty?: CardDifficulty;
  studySeconds?: number;
  type?: CardType;
  format?: string;
  answer?: string;
  improvement?: string;
  note?: string;
  industry?: string;

  // ── 앞면 ──
  situation?: string;
  question: string;
  imageUrl?: string;

  // ── 퀴즈(ox/choice) ──
  choices?: string[];
  answerIndex?: number;

  // ── 뒷면(해설) ──
  principle?: string;
  process?: string;
  fireTriangle?: string;
  conclusion?: string;
  answerImageUrl?: string;
  source?: string;
}

export interface DraftError {
  field: keyof CardDraft | 'root';
  message: string;
}

const DIFFICULTIES: CardDifficulty[] = ['easy', 'medium', 'hard'];
const TYPES: CardType[] = ['explanation', 'ox', 'choice'];

/** 등록 전 검증 — 비어 있거나 규칙에 맞지 않는 필드를 모두 모아 반환(빈 배열이면 통과). */
export function validateCardDraft(input: unknown): DraftError[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return [{ field: 'root', message: '문제는 JSON 객체여야 합니다' }];
  }
  const d = input as Partial<CardDraft>;
  const errs: DraftError[] = [];
  const req = (v: unknown, field: keyof CardDraft, label: string) => {
    if (typeof v !== 'string' || v.trim() === '') errs.push({ field, message: `${label}은(는) 필수입니다` });
  };

  if (!d.category || !(ALL_CATEGORIES as readonly string[]).includes(d.category)) {
    errs.push({ field: 'category', message: `대분류는 ${ALL_CATEGORIES.join(', ')} 중 하나여야 합니다` });
  }
  req(d.subCategory, 'subCategory', '중분류');
  req(d.topic, 'topic', '소분류');
  req(d.title, 'title', '카드명');
  req(d.question, 'question', '문제');
  const textFields: (keyof CardDraft)[] = ['situation', 'principle', 'process', 'fireTriangle', 'conclusion', 'imageUrl', 'answerImageUrl', 'source', 'format', 'answer', 'improvement', 'note', 'industry'];
  for (const field of textFields) {
    if (d[field] !== undefined && typeof d[field] !== 'string') errs.push({ field, message: `${field}은(는) 문자열이어야 합니다` });
  }
  if (d.keywords !== undefined && (!Array.isArray(d.keywords) || !d.keywords.every((v) => typeof v === 'string'))) {
    errs.push({ field: 'keywords', message: '키워드는 문자열 배열이어야 합니다' });
  }
  if (d.studySeconds !== undefined && (typeof d.studySeconds !== 'number' || !Number.isFinite(d.studySeconds) || d.studySeconds <= 0)) {
    errs.push({ field: 'studySeconds', message: '학습 시간은 0보다 큰 숫자여야 합니다' });
  }

  if (d.difficulty && !DIFFICULTIES.includes(d.difficulty)) errs.push({ field: 'difficulty', message: '난이도는 easy/medium/hard 여야 합니다' });
  if (d.type && !TYPES.includes(d.type)) errs.push({ field: 'type', message: '형식은 explanation/ox/choice 여야 합니다' });

  // Validate only after field types are checked; malformed JSON must not throw.
  if (errs.some(e => textFields.includes(e.field as keyof CardDraft))) return errs;
  const format = draftFormat(d);
  const type = draftType(d);
  if (!AUTHOR_CARD_FORMATS.includes(format as typeof AUTHOR_CARD_FORMATS[number])) errs.push({ field: 'format', message: '형식은 기초용어형·상황형·OX형·빈칸형·현장판단형·선택비교형 중 선택해 주세요' });
  const expectedType = format === 'OX형' ? 'ox' : format === '빈칸형' || isSingleChoiceFormat(format) ? 'choice' : 'explanation';
  if (d.type && d.type !== expectedType) errs.push({ field: 'type', message: '형식 이름과 형식 코드가 일치해야 합니다' });
  req(d.principle, 'principle', '상세설명');
  if (type === 'ox' || type === 'choice') {
    const rawChoices = type === 'ox' ? d.choices ?? ['O', 'X'] : d.choices;
    const choices = Array.isArray(rawChoices) ? rawChoices : [];
    if (!Array.isArray(rawChoices) || !choices.every((v) => typeof v === 'string' && !!v.trim()) || (type === 'ox' && choices.length !== 2)) {
      errs.push({ field: 'choices', message: '보기는 비어 있지 않은 문자열 배열이어야 합니다' });
    }
    if (type === 'choice' && (choices.length < 2 || choices.length > 5)) {
      errs.push({ field: 'choices', message: '객관식 보기는 2~5개여야 합니다' });
    }
    if (typeof d.answerIndex !== 'number' || !Number.isInteger(d.answerIndex) || d.answerIndex < 0 || d.answerIndex >= choices.length) {
      errs.push({ field: 'answerIndex', message: '정답 보기 인덱스가 보기 범위를 벗어났습니다' });
    }
    if (choices.every(v => typeof v === 'string')) {
      const selected = choices[d.answerIndex ?? -1]?.trim() ?? '';
      if (d.answer !== undefined && d.answer.trim() !== selected) errs.push({ field: 'answer', message: '정답 원문과 선택한 보기가 일치해야 합니다' });
      if (type === 'ox' && (choices[0] !== 'O' || choices[1] !== 'X')) errs.push({ field: 'choices', message: 'OX 보기는 O, X 순서여야 합니다' });
      if (format === '빈칸형') {
        if ((typeof d.question === 'string' ? d.question.match(/\[빈칸\]|\[\s*\]|_{2,}|[（(]\s*[)）]/g) ?? [] : []).length !== 1) errs.push({ field: 'question', message: '문제에 [빈칸]을 한 개 넣어 주세요' });
        if (choices.length !== 2 || new Set(choices.map(v => v.trim())).size !== 2) errs.push({ field: 'choices', message: '빈칸형 보기는 서로 다른 두 개여야 합니다' });
      }
      const reason = choiceQuestionError(format, choices, selected, d.situation ?? '');
      if (reason) errs.push({ field: 'choices', message: reason });
    }
  }

  return errs;
}

let seq = 0;
/** 초안 → 런타임 시드카드. id 미지정 시 고유 id 를 생성한다. */
export function draftToSeedCard(d: CardDraft, id?: string): SeedCard {
  const type = draftType(d);
  const choices = type === 'ox' ? d.choices ?? ['O', 'X'] : d.choices;
  return {
    id: id ?? `usr-${Date.now().toString(36)}-${(seq++).toString(36)}`,
    category: d.category,
    subCategory: d.subCategory,
    topic: d.topic,
    keywords: d.keywords ?? [],
    title: d.title,
    difficulty: d.difficulty ?? 'medium',
    studySeconds: d.studySeconds ?? 40,
    type,
    format: draftFormat(d),
    answer: d.answer ?? (type !== 'explanation' ? choices?.[d.answerIndex ?? -1] : d.conclusion) ?? '',
    improvement: d.improvement,
    note: d.note,
    industry: d.industry,
    situation: d.situation ?? '',
    question: d.question,
    imageUrl: d.imageUrl,
    choices,
    answerIndex: d.answerIndex,
    principle: d.principle ?? '',
    process: d.process,
    fireTriangle: d.fireTriangle,
    conclusion: d.conclusion ?? '',
    answerImageUrl: d.answerImageUrl,
    source: d.source,
    hasImage: !!(d.imageUrl || d.answerImageUrl),
  };
}

/** 서버 전송용 DTO(snake_case) 매핑 — 실서버 POST /inner/api/v1/cards body. */
export function draftToDTO(d: CardDraft) {
  const type = draftType(d);
  const format = draftFormat(d);
  const choices = type === 'ox' ? ['O', 'X'] : d.choices;
  return {
    format_nm: format,
    answer_txt: d.answer ?? (type !== 'explanation' ? choices?.[d.answerIndex ?? -1] ?? '' : d.conclusion ?? ''),
    improvement_txt: d.improvement ?? '',
    note_txt: d.note ?? '',
    industry_nm: d.industry ?? '',
    category_cd: d.category,
    sub_category_nm: d.subCategory,
    topic_nm: d.topic,
    keywords: d.keywords ?? [],
    title_txt: d.title,
    difficulty_cd: (d.difficulty ?? 'medium').toUpperCase(),
    study_seconds: d.studySeconds ?? 40,
    card_type_cd: type.toUpperCase(),
    situation_txt: d.situation ?? '',
    question_txt: d.question,
    image_url: d.imageUrl,
    choices,
    answer_index: d.answerIndex,
    principle_txt: d.principle ?? '',
    process_txt: d.process,
    fire_triangle_txt: d.fireTriangle,
    conclusion_txt: d.conclusion ?? '',
    answer_image_url: d.answerImageUrl,
    source_txt: d.source,
  };
}
