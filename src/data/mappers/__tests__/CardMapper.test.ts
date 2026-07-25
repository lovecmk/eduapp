import { CardMapper } from '../CardMapper';
import type { CardDTO } from '../../dto/CardDTO';

// __DEV__ 는 RN 번들 전역 — 매퍼가 개발 경고에서 참조하므로 테스트에서 정의해준다.
(globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;

const base: CardDTO = {
  id: 'c1',
  category_cd: 'ELEC',
  question_txt: '  분전반 앞 가연물 방치가 위험한 이유는?  ',
  status_cd: 'NEW',
  due_at: null,
};

describe('CardMapper.toDomain', () => {
  it('snake_case DTO 를 camelCase 도메인으로 매핑하고 공백을 트림한다', () => {
    const card = CardMapper.toDomain({ ...base, sub_category_nm: ' 배선설비 ', title_txt: ' 제목 ' });
    expect(card.id).toBe('c1');
    expect(card.category).toBe('전기 위험');
    expect(card.status).toBe('new');
    expect(card.question).toBe('분전반 앞 가연물 방치가 위험한 이유는?');
    expect(card.subCategory).toBe('배선설비');
    expect(card.title).toBe('제목');
  });

  it('code enum 을 매핑한다 (category/status/difficulty/type)', () => {
    const card = CardMapper.toDomain({
      ...base,
      category_cd: 'HAZMAT',
      status_cd: 'MASTERED',
      difficulty_cd: 'HARD',
      card_type_cd: 'OX',
      choices: ['O', 'X'],
      answer_index: 0,
    });
    expect(card.category).toBe('위험물');
    expect(card.status).toBe('mastered');
    expect(card.difficulty).toBe('hard');
    expect(card.type).toBe('ox');
    expect(card.choices).toEqual(['O', 'X']);
    expect(card.answerIndex).toBe(0);
  });

  it('알 수 없는 category_cd 는 기본값(전기 위험)으로 안전 폴백한다', () => {
    const card = CardMapper.toDomain({ ...base, category_cd: 'UNKNOWN_XYZ' });
    expect(card.category).toBe('전기 위험');
  });

  it('선택 필드 누락 시 기본값을 채운다 (undefined 접근으로 크래시하지 않음)', () => {
    const card = CardMapper.toDomain(base);
    expect(card.keywords).toEqual([]);
    expect(card.studySeconds).toBe(40);
    expect(card.difficulty).toBe('medium');
    expect(card.type).toBe('explanation');
    expect(card.imageUrl).toBeUndefined();
    expect(card.hasImage).toBe(false);
  });

  it('due_at 이 null 이면 dueAt 은 null', () => {
    expect(CardMapper.toDomain(base).dueAt).toBeNull();
  });

  it('유효한 due_at 은 Date 로 파싱한다', () => {
    const card = CardMapper.toDomain({ ...base, due_at: '2026-02-01T00:00:00.000Z' });
    expect(card.dueAt?.toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });

  it('[F3] 파싱 불가한 due_at 은 Invalid Date 가 아니라 null 로 처리한다', () => {
    const card = CardMapper.toDomain({ ...base, due_at: 'garbage-date' });
    expect(card.dueAt).toBeNull(); // NaN 시각이 SRS 비교를 오염시키지 않음
  });

  it('image_url 이 있으면 hasImage=true', () => {
    const card = CardMapper.toDomain({ ...base, image_url: 'https://x/y.png' });
    expect(card.hasImage).toBe(true);
    expect(card.imageUrl).toBe('https://x/y.png');
  });

  it('toDomainList 는 전체를 매핑한다', () => {
    const list = CardMapper.toDomainList([base, { ...base, id: 'c2' }]);
    expect(list.map((c) => c.id)).toEqual(['c1', 'c2']);
  });
});
