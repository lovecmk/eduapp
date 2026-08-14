import type { IQnaRepository } from '../../domain/repositories/IQnaRepository';
import type { Answer, Question, QuestionDraft } from '../../domain/models/Qna';
import { useQnaStore } from '../../store/qnaStore';
import { useAuthStore } from '../../store/authStore';
import { delay } from './_delay';

/**
 * 목업 Q&A — 로컬 스토어(`store/qnaStore`)를 원천으로 쓴다.
 *
 * 서버에 Q&A 라우트가 열리기 전까지 화면이 도는 자리다. 질문·답변은 이 기기에만
 * 남고 남에게 보이지 않는다 — 그 사실은 개발자 화면의 '연결 상태'에 드러난다
 * (repositories/index.ts 의 withMockFallback 이 강등을 기록한다).
 */
export class MockQnaRepository implements IQnaRepository {
  private author(): string {
    return useAuthStore.getState().user?.name ?? '나';
  }

  async list(): Promise<Question[]> {
    await delay(120);
    // 최신순 — 서버 목록과 같은 순서로 보여야 나중에 붙였을 때 화면이 흔들리지 않는다.
    return [...useQnaStore.getState().questions].sort((a, b) => b.createdAt - a.createdAt);
  }

  async get(id: string): Promise<Question | null> {
    await delay(80);
    return useQnaStore.getState().questions.find((q) => q.id === id) ?? null;
  }

  async ask(draft: QuestionDraft): Promise<Question> {
    await delay(150);
    return useQnaStore.getState().ask(draft, this.author());
  }

  async answer(questionId: string, body: string): Promise<Answer> {
    await delay(150);
    const created = useQnaStore.getState().answer(questionId, body, this.author());
    if (!created) throw new Error('질문을 찾을 수 없어요');
    return created;
  }

  async setQuestionLike(questionId: string, liked: boolean): Promise<void> {
    await delay(50);
    useQnaStore.getState().setQuestionLike(questionId, liked);
  }

  async setAnswerLike(questionId: string, answerId: string, liked: boolean): Promise<void> {
    await delay(50);
    useQnaStore.getState().setAnswerLike(questionId, answerId, liked);
  }
}
