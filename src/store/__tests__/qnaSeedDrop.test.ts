// 가짜 시드 정리 규칙 — 저장된 목록에서 무엇을 지우고 무엇을 남기는가.
//
// 시드를 코드에서 없애도 이미 깔린 기기에는 저장된 채로 남는다. 그래서 마이그레이션이
// 털어내는데, 여기서 기준을 잘못 잡으면 사용자가 쓴 글까지 함께 사라진다.
// 지우는 기준은 id 목록이 아니라 '사용자가 손댔는가'다.

import { dropSeededQuestions } from '../qnaStore';
import type { Question, Answer } from '../../domain/models/Qna';

const answer = (over: Partial<Answer> = {}): Answer => ({
  id: 'a1',
  author: '한전기',
  color: '#000',
  body: '접촉저항이 커집니다.',
  likes: 0,
  likedByMe: false,
  mine: false,
  createdAt: 0,
  accepted: false,
  ...over,
});

const question = (over: Partial<Question> = {}): Question => ({
  id: 'q1',
  author: '이안전',
  color: '#000',
  title: '분전반 단자 발열',
  body: '접촉불량만으로도 화재가 되나요?',
  answers: [],
  answerCount: 0,
  myAnswerCount: 0,
  solved: false,
  likes: 0,
  likedByMe: false,
  mine: false,
  createdAt: 0,
  ...over,
});

describe('dropSeededQuestions — 가짜 시드만 걷어낸다', () => {
  it('아무도 손대지 않은 질문(시드)은 지운다', () => {
    expect(dropSeededQuestions([question()])).toEqual([]);
  });

  it('내가 올린 질문은 남긴다', () => {
    const mine = question({ id: 'myq-1', mine: true });
    expect(dropSeededQuestions([question(), mine])).toEqual([mine]);
  });

  it('시드 질문이라도 내가 답변을 달았으면 남긴다', () => {
    // id 로 지웠다면 여기서 내 답변까지 함께 사라진다 — 그래서 '손댔는가'로 판단한다.
    const answered = question({
      answers: [answer({ id: 'a-seed' }), answer({ id: 'mya-1', author: '나', mine: true })],
    });
    expect(dropSeededQuestions([answered])).toEqual([answered]);
  });

  it('빈 목록은 그대로 빈 목록', () => {
    expect(dropSeededQuestions([])).toEqual([]);
  });
});
