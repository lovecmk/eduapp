import { validateCardDraft } from '../models/CardDraft';

const valid = { category: '전기 위험', subCategory: '배선', topic: '점검', title: '카드', question: '질문', principle: '해설' };

describe('JSON 문제 입력 검증', () => {
  it.each([null, undefined, 123, '문제', [], true])('%p 입력도 예외 없이 거절한다', (input) => {
    expect(validateCardDraft(input)[0].field).toBe('root');
  });
  it('설명·사진·키워드·시간의 잘못된 타입을 검출한다', () => {
    const errors = validateCardDraft({ ...valid, principle: 10, imageUrl: {}, keywords: '사진', studySeconds: NaN });
    expect(errors.map((e) => e.field)).toEqual(expect.arrayContaining(['principle', 'imageUrl', 'keywords', 'studySeconds']));
  });
  it.each([NaN, 0.5, -1, 4])('정답 인덱스 %p를 거절한다', (answerIndex) => {
    expect(validateCardDraft({ ...valid, type: 'choice', choices: ['가', '나'], answerIndex }).some((e) => e.field === 'answerIndex')).toBe(true);
  });
  it.each(['가나', [null, '나'], ['', '나']])('보기 %p로는 퀴즈를 만들지 않는다', (choices) => {
    expect(validateCardDraft({ ...valid, type: 'choice', choices, answerIndex: 0 }).some((e) => e.field === 'choices')).toBe(true);
  });
  it('정상 설명형과 기본 OX를 허용한다', () => {
    expect(validateCardDraft(valid)).toEqual([]);
    expect(validateCardDraft({ ...valid, type: 'ox', answerIndex: 0 })).toEqual([]);
  });
});
