import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { qnaRepository } from '../data/repositories';
import type { Question, QuestionDraft } from '../domain/models/Qna';
import { withDerivedCounts } from '../domain/models/Qna';
import { sanitizeText, isMeaningful, INPUT_LIMITS } from '../utils/sanitize';
import { logger } from '../utils/logger';

/**
 * 질문 & 답변 훅.
 *
 * 화면은 더 이상 로컬 스토어를 직접 만지지 않는다 — 저장소가 실서버든 목업이든
 * 여기서 같은 모양으로 보인다. 서버에 `/inner/api/v1/qna` 라우트가 열리는 날 화면 코드는
 * 한 줄도 바뀌지 않는다.
 */

export const QNA_KEYS = {
  all: ['qna'] as const,
  list: ['qna', 'list'] as const,
  detail: (id: string) => ['qna', 'detail', id] as const,
};

/** 제목 최대 길이 — 작성 모달의 입력 제한과 같아야 한다. */
export const QUESTION_TITLE_MAX = 80;

/**
 * 입력 정제·검증을 훅에서 한 번만 한다.
 *
 * 예전에는 이 규칙이 zustand 스토어 안에 있었다. 저장소가 둘(실서버·목업)이 된
 * 지금 그 자리에 두면 실서버 경로만 정제를 건너뛰게 된다 — 서버도 재검증하지만,
 * 화면이 보내는 값 자체가 깨끗해야 "글자는 넣었는데 등록이 안 된다"가 없다.
 */
export function cleanQuestionDraft(draft: QuestionDraft): QuestionDraft | null {
  const title = sanitizeText(draft.title, { maxLength: QUESTION_TITLE_MAX });
  const body = sanitizeText(draft.body, {
    maxLength: INPUT_LIMITS.supportMessage,
    allowNewlines: true,
  });
  if (!isMeaningful(title, 4) || !isMeaningful(body, 5)) return null;
  return { title, body, category: draft.category };
}

/** 답변 본문 정제 — 의미 없는 값이면 null. */
export function cleanAnswerBody(body: string): string | null {
  const clean = sanitizeText(body, {
    maxLength: INPUT_LIMITS.supportMessage,
    allowNewlines: true,
  });
  return isMeaningful(clean, 3) ? clean : null;
}

/** 질문 목록 — 커뮤니티 화면. */
export function useQuestions() {
  return useQuery({
    queryKey: QNA_KEYS.list,
    queryFn: () => qnaRepository.list(),
    staleTime: 30_000,
  });
}

/**
 * 질문 상세.
 *
 * 목록 캐시에 이미 있는 질문을 `placeholderData` 로 먼저 보여준다 — 목록에서
 * 누른 순간 제목·본문은 이미 손에 있는데 빈 화면을 그릴 이유가 없다.
 * (답변 본문은 목록에 없으므로 상세 응답이 도착하면 채워진다.)
 */
export function useQuestion(id: string | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: QNA_KEYS.detail(id ?? ''),
    queryFn: () => qnaRepository.get(id as string),
    enabled: !!id,
    staleTime: 15_000,
    placeholderData: () =>
      qc.getQueryData<Question[]>(QNA_KEYS.list)?.find((q) => q.id === id),
  });
}

/** 목록·상세 캐시에 있는 같은 질문을 한 번에 고친다(낙관적 갱신용). */
function patchQuestion(qc: QueryClient, id: string, fn: (q: Question) => Question) {
  qc.setQueryData<Question[]>(QNA_KEYS.list, (list) =>
    list?.map((q) => (q.id === id ? fn(q) : q)),
  );
  qc.setQueryData<Question | null>(QNA_KEYS.detail(id), (q) => (q ? fn(q) : q));
}

/** 공감 수를 원하는 상태에 맞춘다(같은 상태를 두 번 눌러도 어긋나지 않는다). */
function likeApplied<T extends { likes: number; likedByMe: boolean }>(item: T, liked: boolean): T {
  if (item.likedByMe === liked) return item;
  return { ...item, likedByMe: liked, likes: Math.max(0, item.likes + (liked ? 1 : -1)) };
}

/** 질문 등록 — 성공하면 서버가 준 id 로 상세 캐시를 미리 채운다. */
export function useAskQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (draft: QuestionDraft) => qnaRepository.ask(draft),
    onSuccess: (created) => {
      qc.setQueryData<Question[]>(QNA_KEYS.list, (list) => [created, ...(list ?? [])]);
      qc.setQueryData(QNA_KEYS.detail(created.id), created);
      void qc.invalidateQueries({ queryKey: QNA_KEYS.list });
    },
  });
}

/** 답변 등록. */
export function useAnswerQuestion(questionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => qnaRepository.answer(questionId, body),
    onSuccess: (created) => {
      patchQuestion(qc, questionId, (q) =>
        // 이미 같은 답변이 들어와 있으면(재요청·중복 응답) 두 번 붙이지 않는다.
        q.answers.some((a) => a.id === created.id)
          ? q
          : withDerivedCounts({ ...q, answers: [...q.answers, created] }),
      );
      void qc.invalidateQueries({ queryKey: QNA_KEYS.detail(questionId) });
    },
  });
}

/**
 * 공감(질문·답변) — 낙관적 갱신.
 *
 * 하트는 누른 즉시 반응해야 한다. 서버 응답을 기다리면 지하에서 몇 초씩
 * 아무 일도 일어나지 않고, 사용자는 두 번 세 번 누른다. 실패하면 되돌린다.
 */
export function useQuestionLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, liked }: { id: string; liked: boolean }) =>
      qnaRepository.setQuestionLike(id, liked),
    onMutate: ({ id, liked }) => {
      patchQuestion(qc, id, (q) => likeApplied(q, liked));
    },
    onError: (e, { id, liked }) => {
      patchQuestion(qc, id, (q) => likeApplied(q, !liked));
      logger.warn('qna.like_failed', { reason: String(e) });
    },
  });
}

export function useAnswerLike(questionId: string) {
  const qc = useQueryClient();
  const apply = (answerId: string, liked: boolean) =>
    patchQuestion(qc, questionId, (q) => ({
      ...q,
      answers: q.answers.map((a) => (a.id === answerId ? likeApplied(a, liked) : a)),
    }));
  return useMutation({
    mutationFn: ({ answerId, liked }: { answerId: string; liked: boolean }) =>
      qnaRepository.setAnswerLike(questionId, answerId, liked),
    onMutate: ({ answerId, liked }) => apply(answerId, liked),
    onError: (e, { answerId, liked }) => {
      apply(answerId, !liked);
      logger.warn('qna.answer_like_failed', { reason: String(e) });
    },
  });
}
