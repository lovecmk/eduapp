import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sanitizeText, isMeaningful, INPUT_LIMITS } from '../utils/sanitize';

export interface Answer {
  id: string;
  author: string;
  color: string;
  body: string;
  likes: number;
  likedByMe: boolean;
  mine?: boolean;
  minutesAgo: number;
  accepted?: boolean;
}

export interface Question {
  id: string;
  author: string;
  color: string;
  title: string;
  body: string;
  category?: string;
  answers: Answer[];
  likes: number;
  likedByMe: boolean;
  mine?: boolean;
  minutesAgo: number;
}

const COLORS = ['#5C6BC0', '#26A69A', '#F2B705', '#E2574C', '#7E57C2', '#8D6E63'];
const pick = (i: number) => COLORS[i % COLORS.length];

function seed(): Question[] {
  return [
    {
      id: 'q1', author: '이안전', color: pick(0), category: '소방',
      title: '옥내소화전 방수압, 최상층에서 재는 게 맞나요?',
      body: '가장 먼 소화전에서 잰다고 배웠는데, 현장에서는 최상층 기준으로도 재더라고요. 어떤 게 맞는 걸까요?',
      answers: [
        { id: 'a1', author: '정소방', color: pick(4), body: '규정상 가장 먼(수리적으로 불리한) 소화전 기준이 맞습니다. 보통 최상층+최원거리가 겹치는 경우가 많아요.', likes: 8, likedByMe: false, minutesAgo: 40, accepted: true },
        { id: 'a2', author: '한전기', color: pick(2), body: '피토게이지 각도도 노즐 선단에 수직으로 맞춰야 오차가 적습니다.', likes: 3, likedByMe: false, minutesAgo: 20 },
      ],
      likes: 5, likedByMe: false, minutesAgo: 55,
    },
    {
      id: 'q2', author: '최구조', color: pick(5), category: '구조',
      title: '철근 피복두께 측정기 오차 줄이는 팁 있을까요?',
      body: '전자기유도식으로 재는데 배근이 촘촘한 곳은 값이 튀네요. 노하우 공유 부탁드려요!',
      answers: [
        { id: 'a3', author: '박설비', color: pick(1), body: '배근도로 위치 먼저 잡고, 인접 철근 영향 적은 스팬 중앙부에서 재보세요.', likes: 6, likedByMe: false, minutesAgo: 120 },
      ],
      likes: 9, likedByMe: false, minutesAgo: 180,
    },
    {
      id: 'q3', author: '김점검', color: pick(0), category: '건축',
      title: '옥상 방수 들뜸, 어느 정도부터 보수 대상인가요?',
      body: '타음검사로 공극은 확인했는데 보수 판단 기준이 애매합니다.',
      answers: [],
      likes: 2, likedByMe: false, minutesAgo: 300,
    },
  ];
}

interface QnaState {
  questions: Question[];
  addQuestion: (input: { title: string; body: string; category?: string; author: string }) => string | null;
  addAnswer: (qid: string, body: string, author: string) => void;
  toggleQuestionLike: (id: string) => void;
  toggleAnswerLike: (qid: string, aid: string) => void;
}

export const useQnaStore = create<QnaState>()(
  persist(
    (set) => ({
      questions: seed(),
      addQuestion: ({ title, body, category, author }) => {
        const t = sanitizeText(title, { maxLength: 80 });
        const b = sanitizeText(body, { maxLength: INPUT_LIMITS.supportMessage, allowNewlines: true });
        if (!isMeaningful(t, 4) || !isMeaningful(b, 5)) return null;
        const id = `myq-${Date.now()}`;
        set((s) => ({
          questions: [
            { id, author, color: '#2563EB', title: t, body: b, category, answers: [], likes: 0, likedByMe: false, mine: true, minutesAgo: 0 },
            ...s.questions,
          ],
        }));
        return id;
      },
      addAnswer: (qid, body, author) => {
        const b = sanitizeText(body, { maxLength: INPUT_LIMITS.supportMessage, allowNewlines: true });
        if (!isMeaningful(b, 3)) return;
        set((s) => ({
          questions: s.questions.map((q) =>
            q.id === qid
              ? { ...q, answers: [...q.answers, { id: `mya-${Date.now()}`, author, color: '#2563EB', body: b, likes: 0, likedByMe: false, mine: true, minutesAgo: 0 }] }
              : q,
          ),
        }));
      },
      toggleQuestionLike: (id) =>
        set((s) => ({
          questions: s.questions.map((q) => (q.id === id ? { ...q, likedByMe: !q.likedByMe, likes: q.likes + (q.likedByMe ? -1 : 1) } : q)),
        })),
      toggleAnswerLike: (qid, aid) =>
        set((s) => ({
          questions: s.questions.map((q) =>
            q.id === qid
              ? { ...q, answers: q.answers.map((a) => (a.id === aid ? { ...a, likedByMe: !a.likedByMe, likes: a.likes + (a.likedByMe ? -1 : 1) } : a)) }
              : q,
          ),
        })),
    }),
    { name: 'qna', version: 1, storage: createJSONStorage(() => AsyncStorage) },
  ),
);
