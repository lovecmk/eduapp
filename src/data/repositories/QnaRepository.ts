import type { IQnaRepository } from '../../domain/repositories/IQnaRepository';
import type { Answer, Question, QuestionDraft } from '../../domain/models/Qna';
import { authorColor } from '../../domain/models/Qna';
import { apiClient } from '../network/ApiClient';
import { parseDate } from '../mappers/_date';

/** 서버 응답(snake_case) — docs/API_CONTRACT.md §12 참고. */
interface AnswerDTO {
  id: string;
  author_nm?: string;
  body_txt?: string;
  like_cnt?: number;
  liked_yn?: boolean;
  mine_yn?: boolean;
  accepted_yn?: boolean;
  created_at?: string | null;
}

interface QuestionDTO {
  id: string;
  author_nm?: string;
  category_nm?: string;
  title_txt?: string;
  body_txt?: string;
  like_cnt?: number;
  liked_yn?: boolean;
  mine_yn?: boolean;
  created_at?: string | null;
  /** 목록에서는 생략될 수 있다(상세에서만 채워짐). */
  answers?: AnswerDTO[];
  /** 목록에서도 정확해야 하는 카운터. 없으면 answers 로부터 센다. */
  answer_cnt?: number;
  my_answer_cnt?: number;
  solved_yn?: boolean;
}

/** 목록 응답은 배열 그대로여도, `{ items: [...] }` 로 감싸도 받는다. */
type ListDTO = QuestionDTO[] | { items?: QuestionDTO[] };

const UNKNOWN_AUTHOR = '익명';

function toEpoch(iso: string | null | undefined): number {
  // 시각을 못 읽으면 '방금'으로 둔다. 0(1970년)으로 두면 정렬이 뒤집혀
  // 새로 올라온 질문이 목록 맨 끝으로 밀린다.
  return parseDate(iso ?? null)?.getTime() ?? Date.now();
}

function toAnswer(d: AnswerDTO): Answer {
  const author = d.author_nm?.trim() || UNKNOWN_AUTHOR;
  return {
    id: d.id,
    author,
    color: authorColor(author),
    body: d.body_txt ?? '',
    likes: d.like_cnt ?? 0,
    likedByMe: d.liked_yn === true,
    mine: d.mine_yn === true,
    createdAt: toEpoch(d.created_at),
    accepted: d.accepted_yn === true,
  };
}

function toQuestion(d: QuestionDTO): Question {
  const author = d.author_nm?.trim() || UNKNOWN_AUTHOR;
  const answers = (d.answers ?? []).map(toAnswer);
  return {
    id: d.id,
    author,
    color: authorColor(author),
    title: d.title_txt ?? '',
    body: d.body_txt ?? '',
    category: d.category_nm?.trim() || undefined,
    answers,
    // 카운터는 서버 값이 우선이다 — 목록 응답에는 답변 본문이 없어 셀 수가 없다.
    answerCount: d.answer_cnt ?? answers.length,
    myAnswerCount: d.my_answer_cnt ?? answers.filter((a) => a.mine).length,
    solved: d.solved_yn ?? answers.some((a) => a.accepted),
    likes: d.like_cnt ?? 0,
    likedByMe: d.liked_yn === true,
    mine: d.mine_yn === true,
    createdAt: toEpoch(d.created_at),
  };
}

/** 목록에 담을 최대 질문 수 — 커뮤니티 화면은 이 중 일부만 보여준다. */
const LIST_LIMIT = 30;

/**
 * 실서버 질문 & 답변.
 *  · list()  → GET  /inner/api/v1/qna?limit=
 *  · get(id) → GET  /inner/api/v1/qna/:id
 *  · ask()   → POST /inner/api/v1/qna
 *  · answer()→ POST /inner/api/v1/qna/:id/answers
 *  · 공감    → POST /inner/api/v1/qna/:id/like · /inner/api/v1/qna/:qid/answers/:aid/like
 *
 * 공감만 `postDurable`(오프라인 큐 + 멱등키)을 쓴다. 질문·답변 등록은 서버가
 * 부여한 id 를 받아야 화면이 상세로 이동할 수 있어 응답을 기다려야 하고,
 * 큐에 넣어 나중에 보내면 사용자는 "올렸는데 없다"를 먼저 보게 된다.
 */
export class QnaRepository implements IQnaRepository {
  async list(): Promise<Question[]> {
    const res = await apiClient.get<ListDTO>(`/inner/api/v1/qna?limit=${LIST_LIMIT}`);
    const items = Array.isArray(res) ? res : res?.items ?? [];
    return items.map(toQuestion);
  }

  async get(id: string): Promise<Question | null> {
    const d = await apiClient.get<QuestionDTO | null>(`/inner/api/v1/qna/${encodeURIComponent(id)}`);
    return d ? toQuestion(d) : null;
  }

  async ask(draft: QuestionDraft): Promise<Question> {
    const d = await apiClient.post<QuestionDTO>('/inner/api/v1/qna', {
      title_txt: draft.title,
      body_txt: draft.body,
      category_nm: draft.category ?? null,
    });
    return toQuestion(d);
  }

  async answer(questionId: string, body: string): Promise<Answer> {
    const d = await apiClient.post<AnswerDTO>(
      `/inner/api/v1/qna/${encodeURIComponent(questionId)}/answers`,
      { body_txt: body },
    );
    return toAnswer(d);
  }

  async setQuestionLike(questionId: string, liked: boolean): Promise<void> {
    await apiClient.postDurable(
      `/inner/api/v1/qna/${encodeURIComponent(questionId)}/like`,
      { liked },
      `qna-like:${questionId}:${liked}`,
    );
  }

  async setAnswerLike(questionId: string, answerId: string, liked: boolean): Promise<void> {
    await apiClient.postDurable(
      `/inner/api/v1/qna/${encodeURIComponent(questionId)}/answers/${encodeURIComponent(answerId)}/like`,
      { liked },
      `qna-answer-like:${answerId}:${liked}`,
    );
  }
}
