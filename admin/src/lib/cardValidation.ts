import type { Card } from '../api/types';

/**
 * 문제 유효성 검사 — 서버 service.ValidateCard 와 **같은 규칙**이다.
 *
 * 서버가 이미 검사하는데 화면에서도 하는 이유: 저장 버튼을 누르고 왕복한 뒤에야
 * "해설이 비었습니다"를 알려주면, 긴 문제를 작성한 사람이 매번 왕복하게 된다.
 * 화면 검사는 **편의**이고, 진짜 방어선은 서버다(화면 검사를 우회해도 서버가 막는다).
 *
 * 두 곳의 규칙이 어긋나면 "화면은 통과인데 서버가 거부"하는 최악의 상태가 되므로,
 * 규칙을 바꿀 때는 반드시 양쪽을 함께 고친다.
 */

/** 필드별 오류 메시지. 값이 없는 키는 문제가 없다는 뜻. */
export type CardErrors = Partial<Record<keyof Card | 'choices_answer', string>>;

export function validateCard(card: Card): CardErrors {
  const errors: CardErrors = {};

  if (!card.category_cd.trim()) {
    errors.category_cd = '분야를 입력해주세요';
  }
  if (!card.question_txt.trim()) {
    errors.question_txt = '문제 내용을 입력해주세요';
  }
  if (!card.principle_txt.trim()) {
    errors.principle_txt = '해설을 입력해주세요';
  }

  if (card.card_type_cd === 'OX' || card.card_type_cd === 'CHOICE') {
    const choices = (card.choices ?? []).map((c) => c.trim()).filter(Boolean);
    if (choices.length < 2) {
      errors.choices = '보기를 2개 이상 입력해주세요';
    } else if (card.answer_index === null || card.answer_index === undefined) {
      errors.choices_answer = '정답을 선택해주세요';
    } else if (card.answer_index < 0 || card.answer_index >= choices.length) {
      // 보기를 지웠는데 정답 번호가 그대로 남은 경우 — 앱에서 채점 자체가 불가능해진다.
      errors.choices_answer = '정답이 보기 범위를 벗어났습니다. 다시 선택해주세요';
    }
  }

  if (!['EASY', 'MEDIUM', 'HARD'].includes(card.difficulty_cd)) {
    errors.difficulty_cd = '난이도를 선택해주세요';
  }
  if (!['EXPLANATION', 'OX', 'CHOICE'].includes(card.card_type_cd)) {
    errors.card_type_cd = '문제 형식을 선택해주세요';
  }

  return errors;
}

export function hasErrors(errors: CardErrors): boolean {
  return Object.keys(errors).length > 0;
}

/**
 * 저장 직전 정리 — 서버 normalizeCard 와 같은 규칙.
 * 앞뒤 공백은 앱 화면에서 어긋난 정렬로 보이고, 설명형에 남은 보기·정답은
 * 나중에 형식을 바꿨을 때 유령 데이터로 되살아난다.
 */
export function normalizeCard(card: Card): Card {
  const trimmed: Card = {
    ...card,
    category_cd: card.category_cd.trim(),
    sub_category_nm: card.sub_category_nm.trim(),
    topic_nm: card.topic_nm.trim(),
    title_txt: card.title_txt.trim(),
    situation_txt: card.situation_txt.trim(),
    question_txt: card.question_txt.trim(),
    principle_txt: card.principle_txt.trim(),
    process_txt: card.process_txt.trim(),
    conclusion_txt: card.conclusion_txt.trim(),
    source_txt: card.source_txt.trim(),
    study_seconds: card.study_seconds > 0 ? card.study_seconds : 60,
  };

  if (trimmed.card_type_cd === 'EXPLANATION') {
    trimmed.choices = null;
    trimmed.answer_index = null;
  } else {
    trimmed.choices = (card.choices ?? []).map((c) => c.trim()).filter(Boolean);
  }

  // 빈 배열은 서버에서 null 과 같게 다뤄지므로 굳이 구분해 보내지 않는다.
  trimmed.keywords = (card.keywords ?? []).map((k) => k.trim()).filter(Boolean);

  return trimmed;
}

/** "감전, 누전, ELB" → ["감전","누전","ELB"] */
export function parseKeywords(raw: string): string[] {
  return raw
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
}

/** 형식을 바꿀 때 보기 기본값을 맞춘다(OX 는 항상 O/X 두 개다). */
export function choicesForType(type: Card['card_type_cd'], current: string[] | null): string[] | null {
  if (type === 'EXPLANATION') return null;
  if (type === 'OX') return ['O', 'X'];
  // 객관식으로 바꿀 때 OX 의 O/X 를 그대로 남기면 이상하므로 빈 보기로 시작한다.
  const isOxDefault =
    current !== null && current.length === 2 && current[0] === 'O' && current[1] === 'X';
  if (current === null || isOxDefault) return ['', ''];
  return current;
}
