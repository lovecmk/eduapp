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
      id: 'q1', author: '이안전', color: pick(0), category: '전기 위험',
      title: '분전반 단자 발열, 접촉불량으로 봐야 할까요?',
      body: '전선이 끊어진 것도 아닌데 단자부만 유독 뜨겁습니다. 접촉불량만으로도 화재로 이어질 수 있나요?',
      answers: [
        { id: 'a1', author: '한전기', color: pick(4), body: '접촉불량이면 접촉저항이 커져 그 부위에서 열이 집중됩니다. 정상 작동해도 내부에서 발열이 쌓여 탄화·아크로 진행될 수 있어요.', likes: 8, likedByMe: false, minutesAgo: 40, accepted: true },
        { id: 'a2', author: '박설비', color: pick(2), body: '열화상으로 단자부 온도 먼저 찍어보시고, 재체결 토크도 규정값으로 맞추세요.', likes: 3, likedByMe: false, minutesAgo: 20 },
      ],
      likes: 5, likedByMe: false, minutesAgo: 55,
    },
    {
      id: 'q2', author: '최공정', color: pick(5), category: '공정 위험',
      title: '배기덕트 내부도 위험장소로 관리해야 하나요?',
      body: '도장부스 배기덕트는 사람이 작업하지 않는데, 여기도 방폭·위험장소로 봐야 할지 애매합니다.',
      answers: [
        { id: 'a3', author: '오도장', color: pick(1), body: '덕트는 인화성 증기·미스트가 지나가는 길이라 잔류물·가연성 혼합기가 생깁니다. 1종(21종) 장소로 보는 게 맞아요.', likes: 6, likedByMe: false, minutesAgo: 120 },
      ],
      likes: 9, likedByMe: false, minutesAgo: 180,
    },
    {
      id: 'q3', author: '김점검', color: pick(0), category: '위험물',
      title: '마그네슘 화재, CO₂ 소화기 쓰면 안 되나요?',
      body: '금속화재라 물은 안 된다고 배웠는데, CO₂ 소화기는 써도 되는지 헷갈립니다.',
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
