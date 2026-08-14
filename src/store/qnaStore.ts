import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  authorColor,
  withDerivedCounts,
  type Answer,
  type Question,
  type QuestionDraft,
} from '../domain/models/Qna';

/**
 * 로컬 Q&A 저장소 — **목업 저장소(MockQnaRepository)의 원천**이자 오프라인 사본.
 *
 * 예전에는 화면이 이 스토어를 직접 읽고 썼다. 지금은 화면이 저장소(IQnaRepository)만
 * 보고, 서버가 아직 없을 때만 이 스토어가 그 뒤를 받친다. 서버에 Q&A 라우트가
 * 열리는 순간 화면 코드는 한 줄도 바뀌지 않고 실서버로 넘어간다.
 *
 * **시드(가짜 질문)는 두지 않는다.** 예전에는 '커뮤니티가 비어 보이지 않게' 하려고
 * 이안전·한전기 같은 지어낸 사람의 질문 7건을 깔았다. 그런데 서버에 라우트가 없는
 * 동안에는 그 7건이 화면의 전부라, 사용자는 지어낸 대화를 실제 동료들의 것으로 읽는다.
 * 안전 교육 앱에서 '현장에서 이렇게 하더라'를 가짜로 보여주는 것은 빈 화면보다 나쁘다.
 * 비어 있으면 비어 있다고 말하고(안내 배너), 서버가 열리면 진짜 질문이 채운다.
 */

const MINUTE = 60_000;

interface QnaState {
  questions: Question[];
  /** 질문 등록(정제는 호출부에서 끝난 상태로 들어온다). 만들어진 질문을 돌려준다. */
  ask: (draft: QuestionDraft, author: string) => Question;
  /** 답변 등록. 질문이 없으면 null. */
  answer: (questionId: string, body: string, author: string) => Answer | null;
  /** 공감 상태 설정 — 토글이 아니라 '원하는 상태'를 받는다(재전송 안전). */
  setQuestionLike: (questionId: string, liked: boolean) => void;
  setAnswerLike: (questionId: string, answerId: string, liked: boolean) => void;
}

/**
 * 저장된 목록에서 '사용자가 손대지 않은 질문'을 걷어낸다 — 곧 예전 가짜 시드다.
 *
 * 기준을 id 목록(q1…q7)이 아니라 **손댔는가**로 잡는 이유: 시드 질문에 답변을 달아 둔
 * 사람이 있으면 그 글은 그 사람이 쓴 진짜 글이다. id 로 지우면 그 답변까지 함께 사라진다.
 */
export function dropSeededQuestions(questions: Question[]): Question[] {
  return questions.filter((q) => q.mine || q.answers.some((a) => a.mine));
}

/** 공감 수를 원하는 상태에 맞춰 조정한다(같은 상태를 두 번 받아도 변하지 않는다). */
function applyLike<T extends { likes: number; likedByMe: boolean }>(item: T, liked: boolean): T {
  if (item.likedByMe === liked) return item;
  return { ...item, likedByMe: liked, likes: Math.max(0, item.likes + (liked ? 1 : -1)) };
}

export const useQnaStore = create<QnaState>()(
  persist(
    (set, get) => ({
      questions: [],

      ask: (draft, author) => {
        const created = withDerivedCounts({
          id: `myq-${Date.now()}`,
          author,
          color: authorColor(author),
          title: draft.title,
          body: draft.body,
          category: draft.category,
          answers: [],
          likes: 0,
          likedByMe: false,
          mine: true,
          createdAt: Date.now(),
        });
        set((s) => ({ questions: [created, ...s.questions] }));
        return created;
      },

      answer: (questionId, body, author) => {
        if (!get().questions.some((q) => q.id === questionId)) return null;
        const created: Answer = {
          id: `mya-${Date.now()}`,
          author,
          color: authorColor(author),
          body,
          likes: 0,
          likedByMe: false,
          mine: true,
          createdAt: Date.now(),
          accepted: false,
        };
        set((s) => ({
          questions: s.questions.map((q) =>
            q.id === questionId ? withDerivedCounts({ ...q, answers: [...q.answers, created] }) : q,
          ),
        }));
        return created;
      },

      setQuestionLike: (questionId, liked) =>
        set((s) => ({
          questions: s.questions.map((q) => (q.id === questionId ? applyLike(q, liked) : q)),
        })),

      setAnswerLike: (questionId, answerId, liked) =>
        set((s) => ({
          questions: s.questions.map((q) =>
            q.id === questionId
              ? { ...q, answers: q.answers.map((a) => (a.id === answerId ? applyLike(a, liked) : a)) }
              : q,
          ),
        })),
    }),
    {
      name: 'qna',
      version: 3,
      storage: createJSONStorage(() => AsyncStorage),
      /**
       * v1 → v2: 상대 시간(minutesAgo)을 절대 시각(createdAt)으로 옮기고
       * 파생 카운터를 채운다. 여기서 그냥 시드로 되돌리면 사용자가 직접 올린
       * 질문·답변이 통째로 사라지므로, 값을 옮겨서 살린다.
       *
       * v2 → v3: 이미 깔려 있는 **가짜 시드 질문을 지운다.** 시드를 코드에서 없애도
       * 기존 기기에는 저장된 채로 남아, 업데이트해도 지어낸 질문이 그대로 보인다.
       *
       * 지우는 기준은 '사용자가 손대지 않은 것'이다 — 내가 올린 질문도 아니고
       * 내가 단 답변도 없는 질문. 시드 질문에 답변을 달아 둔 사람이 있다면 그 글은
       * 남긴다(id 목록으로 지우면 그 답변까지 함께 사라진다).
       */
      migrate: (persisted, version) => {
        if (version >= 3) return persisted as QnaState;
        if (version === 2) {
          const cur = (persisted ?? {}) as { questions?: Question[] };
          return { questions: dropSeededQuestions(cur.questions ?? []) } as QnaState;
        }
        const now = Date.now();
        const old = (persisted ?? {}) as { questions?: LegacyQuestion[] };
        const questions = (old.questions ?? []).map((q) =>
          withDerivedCounts({
            id: q.id,
            author: q.author,
            color: q.color || authorColor(q.author ?? ''),
            title: q.title,
            body: q.body,
            category: q.category,
            answers: (q.answers ?? []).map((a) => ({
              id: a.id,
              author: a.author,
              color: a.color || authorColor(a.author ?? ''),
              body: a.body,
              likes: a.likes ?? 0,
              likedByMe: a.likedByMe === true,
              mine: a.mine === true,
              createdAt: now - (a.minutesAgo ?? 0) * MINUTE,
              accepted: a.accepted === true,
            })),
            likes: q.likes ?? 0,
            likedByMe: q.likedByMe === true,
            mine: q.mine === true,
            createdAt: now - (q.minutesAgo ?? 0) * MINUTE,
          }),
        );
        // v1 에서 곧장 올라오는 기기도 시드는 함께 털어낸다(v2→v3 과 같은 기준).
        return { questions: dropSeededQuestions(questions) } as QnaState;
      },
    },
  ),
);

/** v1 저장 형식 — 마이그레이션에서만 쓴다. */
interface LegacyAnswer {
  id: string; author: string; color: string; body: string;
  likes?: number; likedByMe?: boolean; mine?: boolean; minutesAgo?: number; accepted?: boolean;
}
interface LegacyQuestion {
  id: string; author: string; color: string; title: string; body: string; category?: string;
  answers?: LegacyAnswer[]; likes?: number; likedByMe?: boolean; mine?: boolean; minutesAgo?: number;
}

/** 세션 정리(store/sessionScope)가 부르는 초기화 — 다음 사람은 빈 목록부터 시작한다. */
export function resetQnaStore(): void {
  useQnaStore.setState({ questions: [] });
}
