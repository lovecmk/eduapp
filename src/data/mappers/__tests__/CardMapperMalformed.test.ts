import { CardMapper } from '../CardMapper';
import type { CardDTO } from '../../dto/CardDTO';

const base = { id: 'c1', category_cd: 'ELEC', status_cd: 'NEW', question_txt: '문제', due_at: null };
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
  expect([card.category, card.status, card.difficulty, card.type]).toEqual(['전기 위험', 'new', 'medium', 'explanation']);
});
