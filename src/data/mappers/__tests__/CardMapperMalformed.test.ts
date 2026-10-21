import { CardMapper } from '../CardMapper';
import type { CardDTO } from '../../dto/CardDTO';

const base = { id: 'c1', category_cd: 'ELEC', status_cd: 'NEW', question_txt: '문제', due_at: null };
it.each([
  { choices: ['산소', '산소'] },
  { choices: ['산소', '질소', '이산화탄소'] },
  { answer_index: 1 },
  { answer_txt: '보기 밖 정답' },
  { question_txt: '빈칸이 없는 질문' },
  { question_txt: '[빈칸]과 [빈칸]' },
  { card_type_cd: 'OX', choices: ['O', 'X'], answer_txt: 'O' },
])('잘못된 빈칸형으로 오답을 기록하지 않는다: %p', (invalid) => {
  const card = CardMapper.toDomain({ ...base, format_nm: '빈칸형', card_type_cd: 'CHOICE', question_txt: '화재에는 [빈칸]이 필요합니다.', choices: ['산소', '질소'], answer_index: 0, answer_txt: '산소', ...invalid } as CardDTO);
  expect(card.type).toBe('explanation');
  expect(card.choices).toBeUndefined();
  expect(card.answerIndex).toBeUndefined();
});

it('정상 빈칸형과 기존 객관식은 그대로 채점할 수 있다', () => {
  const blank = CardMapper.toDomain({ ...base, format_nm: '빈칸형', card_type_cd: 'CHOICE', question_txt: '화재에는 [　　]이 필요합니다.', choices: [' 산소 ', ' 질소 '], answer_index: 0, answer_txt: '산소' } as CardDTO);
  expect(blank.type).toBe('choice');
  expect(blank.answerIndex).toBe(0);
  const legacy = CardMapper.toDomain({ ...base, format_nm: '객관식', card_type_cd: 'CHOICE', choices: ['가', '나', '다', '라'], answer_index: 2 } as CardDTO);
  expect(legacy.type).toBe('choice');
  expect(legacy.answerIndex).toBe(2);
});

it.each([null, [], {}, { id: 1 }, { id: ' ' }])('잘못된 카드 %p는 TypeError 대신 API 오류로 처리한다', (dto) => {
  expect(() => CardMapper.toDomain(dto as CardDTO)).toThrow('학습카드 응답 형식');
});
it('잘못된 선택 필드와 보기는 크래시/잘못된 채점 없이 처리한다', () => {
  const card = CardMapper.toDomain({ ...base, card_type_cd: 'CHOICE', choices: ['보기', 42], answer_index: 1,
    keywords: ['소방', null, 1], title_txt: 4, image_url: {}, study_seconds: -1 } as unknown as CardDTO);
  expect(card.type).toBe('explanation');
  expect(card.keywords).toEqual(['소방']);
  expect(card.title).toBe('');
  expect(card.imageUrl).toBeUndefined();
  expect(card.studySeconds).toBe(40);
});
it('상속된 객체 속성은 분류 코드로 해석하지 않는다', () => {
  const card = CardMapper.toDomain({ ...base, category_cd: 'constructor', status_cd: 'toString',
    difficulty_cd: '__proto__', card_type_cd: 'constructor' } as unknown as CardDTO);
  expect([card.category, card.status, card.difficulty, card.type]).toEqual(['현장 점검', 'new', 'medium', 'explanation']);
});

it.each([['X', 'O'], ['가', '나'], ['O', 'X', '모름']])('잘못된 OX 보기 %p로 오답을 만들지 않는다', (...choices) => {
  const card = CardMapper.toDomain({ ...base, card_type_cd: 'OX', choices, answer_index: 0 } as CardDTO);
  expect(card.type).toBe('explanation');
  expect(card.choices).toBeUndefined();
});

it('설명형 카드의 잘못된 퀴즈 필드는 화면 모델에 전달하지 않는다', () => {
  const card = CardMapper.toDomain({ ...base, card_type_cd: 'EXPLANATION', choices: { invalid: true }, answer_index: '0' } as unknown as CardDTO);
  expect(card.choices).toBeUndefined();
  expect(card.answerIndex).toBeUndefined();
});
