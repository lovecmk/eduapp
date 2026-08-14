import type { Answer, Question, QuestionDraft } from '../models/Qna';

/**
 * 질문 & 답변 저장소.
 *
 * 커뮤니티는 '남이 있다'는 사실로만 성립한다. 질문·답변이 기기에만 남으면
 * 화면은 그대로인데 아무도 서로를 만나지 못한다 — 지금까지 이 앱의 Q&A 가
 * 그랬다(시드 7건 + 내가 쓴 것만 보이는 로컬 스토어).
 *
 * 쓰기 메서드가 '토글'이 아니라 **원하는 상태**(liked)를 받는 이유는 반응
 * 저장소(IEngagementRepository)와 같다 — 오프라인 큐가 재전송해도 결과가
 * 같아야 하기 때문이다. 토글을 두 번 보내면 원래대로 돌아가 버린다.
 */
export interface IQnaRepository {
  /** 최신 질문 목록. 답변 본문은 없을 수 있고, 개수(answerCount)는 항상 정확하다. */
  list(): Promise<Question[]>;
  /** 질문 상세 — 답변 본문 포함. 없으면 null(삭제된 질문). */
  get(id: string): Promise<Question | null>;
  /** 질문 등록 — 서버가 부여한 id 가 담긴 질문을 돌려준다. */
  ask(draft: QuestionDraft): Promise<Question>;
  /** 답변 등록. */
  answer(questionId: string, body: string): Promise<Answer>;
  /** 질문 공감 상태 설정. */
  setQuestionLike(questionId: string, liked: boolean): Promise<void>;
  /** 답변 공감 상태 설정. */
  setAnswerLike(questionId: string, answerId: string, liked: boolean): Promise<void>;
}
