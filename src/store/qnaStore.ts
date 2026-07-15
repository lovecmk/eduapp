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
    {
      id: 'q4', author: '정보전', color: pick(3), category: '전기 위험',
      title: '누전차단기가 자꾸 떨어지는데 원인 파악 순서가 궁금해요',
      body: '설비를 돌리면 간헐적으로 누전차단기가 트립됩니다. 절연저항부터 봐야 할지, 부하 분리부터 해야 할지 순서를 잡기가 어렵습니다.',
      answers: [
        { id: 'a4', author: '한전기', color: pick(4), body: '먼저 부하를 하나씩 분리하며 어느 회로에서 트립되는지 좁히고, 해당 구간 절연저항(500V 메거)으로 확인하세요.', likes: 4, likedByMe: false, minutesAgo: 60 },
      ],
      likes: 3, likedByMe: false, minutesAgo: 90,
    },
    {
      id: 'q5', author: '서작업', color: pick(1), category: '공정 위험',
      title: '밀폐공간 작업 전 산소농도, 몇 %면 진입 가능한가요?',
      body: '탱크 내부 청소 작업인데, 산소농도 기준과 측정 위치(상·중·하)를 어떻게 잡아야 안전한지 알고 싶습니다.',
      answers: [
        { id: 'a5', author: '오도장', color: pick(2), body: '적정 산소농도는 18~23.5%입니다. 상·중·하 3점 이상 측정하고, 작업 중에도 연속 측정을 유지하세요.', likes: 7, likedByMe: false, minutesAgo: 200, accepted: true },
      ],
      likes: 6, likedByMe: false, minutesAgo: 240,
    },
    {
      id: 'q6', author: '문안전', color: pick(2), category: '위험물',
      title: '유증기 체류 구역, 방폭등급 어떻게 정하나요?',
      body: '도료 보관창고 환기가 약한데, 방폭기구를 어느 등급으로 선정해야 하는지 근거를 잡기 어렵습니다.',
      answers: [],
      likes: 4, likedByMe: false, minutesAgo: 420,
    },
    {
      id: 'q7', author: '조현장', color: pick(5), category: '공정 위험',
      title: '고소작업 안전대 체결 위치, 발밑 걸어도 되나요?',
      body: '비계에서 안전대를 발밑 난간에 거는 동료가 있는데, 추락 시 충격이 더 크지 않을까요? 올바른 체결 높이가 궁금합니다.',
      answers: [
        { id: 'a7', author: '박설비', color: pick(0), body: '가능하면 D링보다 높은 지점에 체결해 추락거리를 줄여야 합니다. 발밑 체결은 추락거리가 길어져 충격이 커집니다.', likes: 5, likedByMe: false, minutesAgo: 330 },
      ],
      likes: 8, likedByMe: false, minutesAgo: 500,
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
