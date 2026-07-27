import { describe, it, expect } from 'vitest';
import { emptyCard, type Card } from '../api/types';
import {
  validateCard,
  hasErrors,
  normalizeCard,
  parseKeywords,
  choicesForType,
} from './cardValidation';

/**
 * 문제 검증은 서버(service.ValidateCard)와 같은 규칙이어야 한다.
 * 두 곳이 어긋나면 "화면은 통과인데 서버가 거부"하는 최악의 상태가 되므로,
 * 여기서 규칙을 못 박아 둔다.
 */

function choiceCard(over: Partial<Card> = {}): Card {
  return {
    ...emptyCard(),
    category_cd: 'ELEC',
    question_txt: '문제',
    principle_txt: '해설',
    card_type_cd: 'CHOICE',
    difficulty_cd: 'EASY',
    choices: ['가', '나', '다'],
    answer_index: 0,
    ...over,
  };
}

describe('validateCard — 앱에서 깨질 문제를 저장 전에 거른다', () => {
  it('올바른 문제는 오류가 없다', () => {
    expect(hasErrors(validateCard(choiceCard()))).toBe(false);
  });

  it('분야·문제·해설은 필수다', () => {
    expect(validateCard(choiceCard({ category_cd: '' })).category_cd).toBeTruthy();
    expect(validateCard(choiceCard({ question_txt: '   ' })).question_txt).toBeTruthy();
    expect(validateCard(choiceCard({ principle_txt: '' })).principle_txt).toBeTruthy();
  });

  it('보기가 2개 미만이면 거부한다', () => {
    expect(validateCard(choiceCard({ choices: ['하나'] })).choices).toBeTruthy();
    expect(validateCard(choiceCard({ choices: [] })).choices).toBeTruthy();
  });

  it('공백만 있는 보기는 개수에 세지 않는다', () => {
    // '가', '  ' → 실질적으로 보기 1개
    expect(validateCard(choiceCard({ choices: ['가', '   '] })).choices).toBeTruthy();
  });

  it('정답을 지정하지 않으면 거부한다', () => {
    expect(validateCard(choiceCard({ answer_index: null })).choices_answer).toBeTruthy();
  });

  it('정답이 보기 범위를 벗어나면 거부한다(앱에서 채점 불가)', () => {
    expect(validateCard(choiceCard({ answer_index: 5 })).choices_answer).toBeTruthy();
    expect(validateCard(choiceCard({ answer_index: -1 })).choices_answer).toBeTruthy();
  });

  it('보기를 지워 정답이 범위를 벗어난 상태를 잡아낸다', () => {
    // 보기 3개 중 3번(index 2)이 정답이었는데 보기가 2개로 줄어든 상황.
    const card = choiceCard({ choices: ['가', '나'], answer_index: 2 });
    expect(validateCard(card).choices_answer).toBeTruthy();
  });

  it('설명형은 보기·정답이 없어도 통과한다', () => {
    const card = choiceCard({ card_type_cd: 'EXPLANATION', choices: null, answer_index: null });
    expect(hasErrors(validateCard(card))).toBe(false);
  });

  it('알 수 없는 형식·난이도를 거부한다', () => {
    expect(validateCard(choiceCard({ card_type_cd: 'MYSTERY' as never })).card_type_cd).toBeTruthy();
    expect(validateCard(choiceCard({ difficulty_cd: 'NOPE' as never })).difficulty_cd).toBeTruthy();
  });
});

describe('normalizeCard — 저장 전 정리', () => {
  it('앞뒤 공백을 다듬는다', () => {
    const out = normalizeCard(choiceCard({ question_txt: '  문제  ', title_txt: ' 제목 ' }));
    expect(out.question_txt).toBe('문제');
    expect(out.title_txt).toBe('제목');
  });

  it('설명형으로 바꾸면 보기·정답을 지운다(유령 데이터 방지)', () => {
    const out = normalizeCard(choiceCard({ card_type_cd: 'EXPLANATION' }));
    expect(out.choices).toBeNull();
    expect(out.answer_index).toBeNull();
  });

  it('빈 보기를 걸러낸다', () => {
    const out = normalizeCard(choiceCard({ choices: ['가', '  ', '나', ''] }));
    expect(out.choices).toEqual(['가', '나']);
  });

  it('학습 시간이 0 이하면 기본값 60초로 채운다', () => {
    expect(normalizeCard(choiceCard({ study_seconds: 0 })).study_seconds).toBe(60);
    expect(normalizeCard(choiceCard({ study_seconds: -5 })).study_seconds).toBe(60);
  });

  it('키워드의 빈 항목을 제거한다', () => {
    const out = normalizeCard(choiceCard({ keywords: ['ELB', '  ', '감전'] }));
    expect(out.keywords).toEqual(['ELB', '감전']);
  });
});

describe('parseKeywords', () => {
  it('쉼표로 나누고 공백을 다듬는다', () => {
    expect(parseKeywords(' ELB, 감전 ,누설전류 ')).toEqual(['ELB', '감전', '누설전류']);
  });

  it('빈 문자열은 빈 배열', () => {
    expect(parseKeywords('')).toEqual([]);
    expect(parseKeywords(' , , ')).toEqual([]);
  });
});

describe('choicesForType — 형식 전환 시 보기 정리', () => {
  it('설명형은 보기가 없다', () => {
    expect(choicesForType('EXPLANATION', ['가', '나'])).toBeNull();
  });

  it('OX 는 항상 O/X 두 개다', () => {
    expect(choicesForType('OX', null)).toEqual(['O', 'X']);
    expect(choicesForType('OX', ['가', '나', '다'])).toEqual(['O', 'X']);
  });

  it('OX 에서 객관식으로 바꾸면 O/X 를 빈 보기로 바꾼다', () => {
    expect(choicesForType('CHOICE', ['O', 'X'])).toEqual(['', '']);
  });

  it('객관식 보기를 이미 쓰고 있었다면 그대로 유지한다', () => {
    expect(choicesForType('CHOICE', ['가', '나', '다'])).toEqual(['가', '나', '다']);
  });

  it('보기가 없던 상태에서 객관식으로 바꾸면 빈 보기 2개로 시작한다', () => {
    expect(choicesForType('CHOICE', null)).toEqual(['', '']);
  });
});
