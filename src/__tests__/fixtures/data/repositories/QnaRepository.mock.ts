import type { IQnaRepository } from '../../../../domain/repositories/IQnaRepository';
import type { Answer, Question, QuestionDraft } from '../../../../domain/models/Qna';
import { useQnaStore } from '../../../../store/qnaStore';
import { useAuthStore } from '../../../../store/authStore';
import { authorColor } from '../../../../domain/models/Qna';
import { authorLabel, displayName } from '../../../../domain/models/User';
import { delay } from '../../../../data/repositories/_delay';

/**
 * 목업 Q&A — 로컬 스토어(`store/qnaStore`)를 원천으로 쓴다.
 *
 * 서버에 Q&A 라우트가 열리기 전까지 화면이 도는 자리다. 질문·답변은 이 기기에만
 * 남고 남에게 보이지 않는다 — 그 사실은 개발자 화면의 '연결 상태'에 드러난다
 * (repositories/index.ts 의 withMockFallback 이 강등을 기록한다).
 */
export class MockQnaRepository implements IQnaRepository {
  /**
   * 글에 적어 둘 이름 — **닉네임**이다.
   *
   * 예전에는 `user.name`(본명)을 썼다. 서버는 닉네임을 적으므로 같은 앱이
   * 목업이냐 실서버냐에 따라 커뮤니티에 본명이 나가기도 하고 닉네임이 나가기도
   * 했다. 닉네임을 쓰는 이유가 "같은 회사 사람들이 함께 보는 화면"인데, 두 경로
   * 중 하나만 본명을 쓰면 그 이유가 통째로 무너진다.
   */
  private author(): string {
    return displayName(useAuthStore.getState().user);
  }

  /**
   * 저장된 이름을 **지금 이름으로** 바꿔 준다(서버의 authorname.go 와 같은 일).
   *
   * 목업은 이 기기에 남은 글만 다루므로 내 글의 작성자는 언제나 나다. 그래서
   * 닉네임을 바꾸면 여기서도 옛 이름이 그대로 남는데, 실서버에서는 새 이름이
   * 나온다. 두 경로의 화면이 달라지면 서버가 붙는 날 "왜 갑자기 이름이 바뀌지"가
   * 된다 — 같은 규칙을 여기서도 적용해 둔다.
   */
  private live<T extends { author: string; mine?: boolean }>(item: T): T {
    const me = useAuthStore.getState().user;
    const author = authorLabel(item.author, item.mine, me);
    if (author === item.author) return item;
    return { ...item, author, color: authorColor(author) };
  }

  private liveQuestion(q: Question): Question {
    return { ...this.live(q), answers: q.answers.map((a) => this.live(a)) };
  }

  async list(): Promise<Question[]> {
    await delay(120);
    // 최신순 — 서버 목록과 같은 순서로 보여야 나중에 붙였을 때 화면이 흔들리지 않는다.
    return [...useQnaStore.getState().questions]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((q) => this.liveQuestion(q));
  }

  async get(id: string): Promise<Question | null> {
    await delay(80);
    const q = useQnaStore.getState().questions.find((item) => item.id === id);
    return q ? this.liveQuestion(q) : null;
  }

  async ask(draft: QuestionDraft): Promise<Question> {
    await delay(150);
    // 이름은 폴백으로 적어 둔다(서버의 author_nm 과 같은 역할).
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
