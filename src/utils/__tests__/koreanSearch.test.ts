import { normalize, toChosung, isChosungQuery, matchScore, bestScore } from '../koreanSearch';

describe('normalize', () => {
  it('공백·기호를 지우고 소문자로 만든다', () => {
    expect(normalize('글자 크기')).toBe('글자크기');
    expect(normalize('Face ID · 지문')).toBe('faceid지문');
  });
});

describe('toChosung', () => {
  it('완성형 한글을 초성으로 바꾼다', () => {
    expect(toChosung('글자크기')).toBe('ㄱㅈㅋㄱ');
    expect(toChosung('알림')).toBe('ㅇㄹ');
  });

  it('한글이 아닌 글자는 그대로 둔다', () => {
    expect(toChosung('v1 버전')).toBe('v1 ㅂㅈ');
  });
});

describe('isChosungQuery', () => {
  it.each(['ㄱㅈ', 'ㅇㄹ', 'ㅋㄱ'])('초성만으로 이루어진 질의(%s)를 인식한다', (q) => {
    expect(isChosungQuery(q)).toBe(true);
  });

  it.each(['글자', 'dark', ''])('초성 질의가 아니면 false (%s)', (q) => {
    expect(isChosungQuery(q)).toBe(false);
  });
});

describe('matchScore', () => {
  it('완전 일치 > 접두 일치 > 부분 일치 순으로 점수가 높다', () => {
    const exact = matchScore('테마', '테마');
    const prefix = matchScore('테마 설정', '테마');
    const partial = matchScore('배경 테마', '테마');
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(partial);
    expect(partial).toBeGreaterThan(0);
  });

  it('공백을 무시하고 매칭한다', () => {
    expect(matchScore('글자 크기', '글자크기')).toBeGreaterThan(0);
  });

  it('초성만 입력해도 찾는다', () => {
    expect(matchScore('글자 크기', 'ㄱㅈㅋㄱ')).toBeGreaterThan(0);
    expect(matchScore('글자 크기', 'ㅋㄱ')).toBeGreaterThan(0);
  });

  it('초성이 아닌 질의는 초성 매칭으로 오탐하지 않는다', () => {
    expect(matchScore('알림 받기', '테마')).toBe(0);
  });

  it('빈 질의는 매칭되지 않는다', () => {
    expect(matchScore('알림', '')).toBe(0);
    expect(matchScore('알림', '   ')).toBe(0);
  });
});

describe('bestScore', () => {
  it('여러 필드 중 가장 높은 가중 점수를 돌려준다', () => {
    const score = bestScore(
      [
        { text: '고대비 모드', weight: 1 },
        { text: '야외 가독성 강화', weight: 0.7 },
      ],
      '가독성',
    );
    expect(score).toBeGreaterThan(0);
  });

  it('어느 필드에도 걸리지 않으면 0', () => {
    expect(bestScore([{ text: '테마' }, { text: '글자 크기' }], '생체인증')).toBe(0);
  });
});
