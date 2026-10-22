import { draftToDTO, draftToSeedCard, validateCardDraft, type CardDraft } from '../models/CardDraft';

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

it('delivers v2 format, independent raw answer, improvement and note without legacy alias loss', () => {
  const dto = draftToDTO({ ...valid, category: '전기 위험', type: 'ox', answerIndex: 1, answer: 'X', conclusion: 'legacy explanation', improvement: '개선 😀', note: '참고', format: 'OX형' });
  expect(dto).toMatchObject({ format_nm: 'OX형', answer_txt: 'X', conclusion_txt: 'legacy explanation', improvement_txt: '개선 😀', note_txt: '참고' });
});

describe('card-library v2 저작 계약', () => {
  it.each([
    ['기초용어형', 'explanation', undefined, undefined, '질문'],
    ['상황형', 'explanation', undefined, undefined, '질문'],
    ['OX형', 'ox', ['O', 'X'], 1, '질문'],
    ['빈칸형', 'choice', ['산소', '질소'], 0, '[빈칸]이 필요합니다'],
    ['현장판단형', 'choice', ['정지', '진행', '확인'], 0, '질문'],
    ['선택비교형', 'choice', ['정지', '진행'], 1, '질문'],
  ] as const)('%s의 형식·정답·보기와 부가 본문을 전송한다', (format, type, choices, answerIndex, question) => {
    const draft: CardDraft = { ...valid, category: '전기 위험', format, type, choices: choices ? [...choices] : undefined, answerIndex, question, situation: '점검 중', conclusion: '핵심 요약', improvement: '개선', note: '선행 학습 😀', industry: '보험' };
    expect(validateCardDraft(draft)).toEqual([]);
    const answer = choices ? choices[answerIndex!] : draft.conclusion;
    expect(draftToDTO(draft)).toMatchObject({ format_nm: format, card_type_cd: type.toUpperCase(), answer_txt: answer, improvement_txt: '개선', note_txt: '선행 학습 😀', industry_nm: '보험' });
    expect(draftToSeedCard(draft)).toMatchObject({ format, answer, improvement: '개선', note: '선행 학습 😀', industry: '보험' });
  });
  it.each([
    { format: '객관식', type: 'choice', choices: ['가', '나'], answerIndex: 0 },
    { format: 'OX형', type: 'explanation' },
    { format: '빈칸형', type: 'choice', choices: ['가', '가'], answerIndex: 0 },
    { format: '선택비교형', type: 'choice', choices: ['가', '나'], answerIndex: 1, answer: '가' },
    { format: '현장판단형', type: 'choice', situation: '', choices: ['가', '나', '다'], answerIndex: 0 },
    { principle: '', conclusion: '요약만 있음' },
  ])('서버가 거절할 저작 입력을 미리 차단한다: %p', fields => {
    expect(validateCardDraft({ ...valid, ...fields }).length).toBeGreaterThan(0);
  });
});
