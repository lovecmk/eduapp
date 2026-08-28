// 답변 한 건을 붙일 때 **개수를 다시 세지 않는지** 지킨다.
//
// 커뮤니티 목록의 질문은 답변 본문 없이(answers: []) 개수만 서버 값으로 들어온다.
// 거기에 방금 쓴 답변을 붙이고 answers.length 로 개수를 다시 세면, 답변 12개짜리
// 질문이 '답변 1'로 바뀌고 '해결됨' 배지까지 사라진다. 목록을 다시 받기 전까지
// 화면이 서버보다 오래된 것이 아니라 **틀린 값**을 보여 주는 상태다.

import { withAppendedAnswer, type Answer, type Question } from '../models/Qna';

function answer(over: Partial<Answer> = {}): Answer {
  return {
    id: 'a-new', author: '나', color: '#000', body: '이렇게 하세요',
    likes: 0, likedByMe: false, mine: true, createdAt: 1, accepted: false,
    ...over,
  };
}

/** 목록에서 온 질문 — 본문은 없고 개수만 서버가 알려 준 상태. */
function listQuestion(over: Partial<Question> = {}): Question {
  return {
    id: 'q1', author: '이안전', color: '#000', title: '제목', body: '본문',
    answers: [], answerCount: 12, myAnswerCount: 2, solved: true,
    likes: 5, likedByMe: false, mine: false, createdAt: 1,
    ...over,
  };
}

describe('withAppendedAnswer', () => {
  it('목록 질문(본문 없음)의 개수를 더한다 — 다시 세지 않는다', () => {
    const next = withAppendedAnswer(listQuestion(), answer());
    expect(next.answerCount).toBe(13);
    expect(next.myAnswerCount).toBe(3);
    // 본문을 반쯤 채우지 않는다 — "답변이 하나뿐"이라는 또 다른 거짓말이 된다.
    expect(next.answers).toEqual([]);
  });

  it('이미 해결된 질문의 배지를 떨어뜨리지 않는다', () => {
    expect(withAppendedAnswer(listQuestion(), answer()).solved).toBe(true);
  });

  it('상세 질문(본문 전부 보유)에는 본문까지 끼워 넣는다', () => {
    const detail = listQuestion({
      answerCount: 1,
      myAnswerCount: 0,
      solved: false,
      answers: [answer({ id: 'a-old', mine: false })],
    });
    const next = withAppendedAnswer(detail, answer());
    expect(next.answers.map((a) => a.id)).toEqual(['a-old', 'a-new']);
    expect(next.answerCount).toBe(2);
    expect(next.myAnswerCount).toBe(1);
  });

  it('같은 답변이 두 번 와도 개수가 두 번 오르지 않는다', () => {
    const detail = listQuestion({ answerCount: 0, myAnswerCount: 0, solved: false, answers: [] });
    const once = withAppendedAnswer(detail, answer());
    expect(withAppendedAnswer(once, answer())).toBe(once);
  });

  it('남이 단 답변은 내 기여 수를 올리지 않는다', () => {
    const next = withAppendedAnswer(listQuestion(), answer({ mine: false }));
    expect(next.answerCount).toBe(13);
    expect(next.myAnswerCount).toBe(2);
  });
});
