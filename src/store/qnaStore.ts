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
 * 시드 7건은 '커뮤니티가 비어 보이지 않게' 하는 장치다. 서버가 붙으면 실제 질문이
 * 그 자리를 대신한다.
 */

const MINUTE = 60_000;

function seed(): Question[] {
  const now = Date.now();
  const at = (minutesAgo: number) => now - minutesAgo * MINUTE;
  const q = (
    id: string,
    author: string,
    category: string,
    title: string,
    body: string,
    likes: number,
    minutesAgo: number,
    answers: Answer[],
  ): Question =>
    withDerivedCounts({
      id,
      author,
      color: authorColor(author),
      category,
      title,
      body,
      answers,
      likes,
      likedByMe: false,
      mine: false,
      createdAt: at(minutesAgo),
    });
  const a = (
    id: string,
    author: string,
    body: string,
    likes: number,
    minutesAgo: number,
    accepted = false,
  ): Answer => ({
    id,
    author,
    color: authorColor(author),
    body,
    likes,
    likedByMe: false,
    mine: false,
    createdAt: at(minutesAgo),
    accepted,
  });

  return [
    q('q1', '이안전', '전기 위험',
      '분전반 단자 발열, 접촉불량으로 봐야 할까요?',
      '전선이 끊어진 것도 아닌데 단자부만 유독 뜨겁습니다. 접촉불량만으로도 화재로 이어질 수 있나요?',
      5, 55, [
        a('a1', '한전기', '접촉불량이면 접촉저항이 커져 그 부위에서 열이 집중됩니다. 정상 작동해도 내부에서 발열이 쌓여 탄화·아크로 진행될 수 있어요.', 8, 40, true),
        a('a2', '박설비', '열화상으로 단자부 온도 먼저 찍어보시고, 재체결 토크도 규정값으로 맞추세요.', 3, 20),
      ]),
    q('q2', '최공정', '공정 위험',
      '배기덕트 내부도 위험장소로 관리해야 하나요?',
      '도장부스 배기덕트는 사람이 작업하지 않는데, 여기도 방폭·위험장소로 봐야 할지 애매합니다.',
      9, 180, [
        a('a3', '오도장', '덕트는 인화성 증기·미스트가 지나가는 길이라 잔류물·가연성 혼합기가 생깁니다. 1종(21종) 장소로 보는 게 맞아요.', 6, 120),
      ]),
    q('q3', '김점검', '위험물',
      '마그네슘 화재, CO₂ 소화기 쓰면 안 되나요?',
      '금속화재라 물은 안 된다고 배웠는데, CO₂ 소화기는 써도 되는지 헷갈립니다.',
      2, 300, []),
    q('q4', '정보전', '전기 위험',
      '누전차단기가 자꾸 떨어지는데 원인 파악 순서가 궁금해요',
      '설비를 돌리면 간헐적으로 누전차단기가 트립됩니다. 절연저항부터 봐야 할지, 부하 분리부터 해야 할지 순서를 잡기가 어렵습니다.',
      3, 90, [
        a('a4', '한전기', '먼저 부하를 하나씩 분리하며 어느 회로에서 트립되는지 좁히고, 해당 구간 절연저항(500V 메거)으로 확인하세요.', 4, 60),
      ]),
    q('q5', '서작업', '공정 위험',
      '밀폐공간 작업 전 산소농도, 몇 %면 진입 가능한가요?',
      '탱크 내부 청소 작업인데, 산소농도 기준과 측정 위치(상·중·하)를 어떻게 잡아야 안전한지 알고 싶습니다.',
      6, 240, [
        a('a5', '오도장', '적정 산소농도는 18~23.5%입니다. 상·중·하 3점 이상 측정하고, 작업 중에도 연속 측정을 유지하세요.', 7, 200, true),
      ]),
    q('q6', '문안전', '위험물',
      '유증기 체류 구역, 방폭등급 어떻게 정하나요?',
      '도료 보관창고 환기가 약한데, 방폭기구를 어느 등급으로 선정해야 하는지 근거를 잡기 어렵습니다.',
      4, 420, []),
    q('q7', '조현장', '공정 위험',
      '고소작업 안전대 체결 위치, 발밑 걸어도 되나요?',
      '비계에서 안전대를 발밑 난간에 거는 동료가 있는데, 추락 시 충격이 더 크지 않을까요? 올바른 체결 높이가 궁금합니다.',
      8, 500, [
        a('a7', '박설비', '가능하면 D링보다 높은 지점에 체결해 추락거리를 줄여야 합니다. 발밑 체결은 추락거리가 길어져 충격이 커집니다.', 5, 330),
      ]),
  ];
}

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

/** 공감 수를 원하는 상태에 맞춰 조정한다(같은 상태를 두 번 받아도 변하지 않는다). */
function applyLike<T extends { likes: number; likedByMe: boolean }>(item: T, liked: boolean): T {
  if (item.likedByMe === liked) return item;
  return { ...item, likedByMe: liked, likes: Math.max(0, item.likes + (liked ? 1 : -1)) };
}

export const useQnaStore = create<QnaState>()(
  persist(
    (set, get) => ({
      questions: seed(),

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
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      /**
       * v1 → v2: 상대 시간(minutesAgo)을 절대 시각(createdAt)으로 옮기고
       * 파생 카운터를 채운다. 여기서 그냥 시드로 되돌리면 사용자가 직접 올린
       * 질문·답변이 통째로 사라지므로, 값을 옮겨서 살린다.
       */
      migrate: (persisted, version) => {
        if (version >= 2) return persisted as QnaState;
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
        return { questions } as QnaState;
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

/** 세션 정리(store/sessionScope)가 부르는 초기화 — 다음 사람은 시드부터 시작한다. */
export function resetQnaStore(): void {
  useQnaStore.setState({ questions: seed() });
}
