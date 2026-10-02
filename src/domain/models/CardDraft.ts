// 문제(학습카드) 등록용 작성 초안 — "웹 등록 도구가 내보내는 메타데이터 계약".
// 서버 이관 후에도 이 형태(JSON)를 그대로 POST /inner/api/v1/cards 로 보내면 되도록 단일화한다.
import { ALL_CATEGORIES } from '../../constants/categories';
import type { CardCategory, CardDifficulty, CardType, SeedCard } from './LearningCard';

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
  const textFields: (keyof CardDraft)[] = ['situation', 'principle', 'process', 'fireTriangle', 'conclusion', 'imageUrl', 'answerImageUrl', 'source'];
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

  const type = d.type ?? 'explanation';
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
  } else {
    // 설명형은 해설(원리·결론) 중 하나라도 있어야 카드가 성립.
    if (!((typeof d.principle === 'string' && d.principle.trim()) || (typeof d.conclusion === 'string' && d.conclusion.trim()))) {
      errs.push({ field: 'principle', message: '설명형은 핵심 원리 또는 결론 중 하나는 필요합니다' });
    }
  }

  return errs;
}

let seq = 0;
/** 초안 → 런타임 시드카드. id 미지정 시 고유 id 를 생성한다. */
export function draftToSeedCard(d: CardDraft, id?: string): SeedCard {
  const type = d.type ?? 'explanation';
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
  const type = d.type ?? 'explanation';
  return {
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
    choices: type === 'ox' ? d.choices ?? ['O', 'X'] : d.choices,
    answer_index: d.answerIndex,
    principle_txt: d.principle ?? '',
    process_txt: d.process,
    fire_triangle_txt: d.fireTriangle,
    conclusion_txt: d.conclusion ?? '',
    answer_image_url: d.answerImageUrl,
    source_txt: d.source,
  };
}
