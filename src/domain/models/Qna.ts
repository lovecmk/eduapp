/**
 * 질문 & 답변(커뮤니티 Q&A) 도메인 모델.
 *
 * 지금까지 Q&A 는 화면이 zustand 스토어(`store/qnaStore`)를 직접 읽고 쓰는 구조라
 * **기기 안에서만** 존재했다. 내가 올린 질문은 남에게 보이지 않고, 남의 질문은
 * 시드 데이터였다 — 커뮤니티의 모양만 있고 커뮤니티는 없었다.
 * 이 모델은 그 데이터를 저장소(IQnaRepository) 뒤로 옮기기 위한 계약이다.
 *
 * 시간은 `minutesAgo`(상대값)가 아니라 `createdAt`(절대 시각)으로 갖는다.
 * 상대값은 받아온 순간 얼어붙어, 화면을 30분 띄워 두면 "3분 전"이 계속 3분 전이다.
 */

/** 목록 응답에는 답변 본문이 없을 수 있다 — 그때도 개수는 필요하다(카운터 필드 참고). */
export interface Answer {
  id: string;
  author: string;
  /** 작성자 이름에서 파생한 아바타 색(서버가 주지 않으므로 클라이언트가 정한다). */
  color: string;
  body: string;
  likes: number;
  likedByMe: boolean;
  mine: boolean;
  /** 작성 시각(epoch ms) */
  createdAt: number;
  /** 질문자가 채택한 답변인지 */
  accepted: boolean;
}

export interface Question {
  id: string;
  author: string;
  color: string;
  title: string;
  body: string;
  category?: string;
  /**
   * 답변 목록. **목록 조회에서는 비어 있을 수 있다**(서버가 본문을 싣지 않는다).
   * 개수·해결 여부를 판단할 때는 아래 카운터 필드를 쓴다.
   */
  answers: Answer[];
  /** 전체 답변 수 — 목록에서도 정확하다. */
  answerCount: number;
  /** 그중 내가 단 답변 수 — '내 기여' 한 줄이 목록만으로 계산되게 한다. */
  myAnswerCount: number;
  /** 채택된 답변이 있는가('해결됨' 배지). */
  solved: boolean;
  likes: number;
  likedByMe: boolean;
  mine: boolean;
  createdAt: number;
}

/** 질문 작성 입력 — 정제 전 원문. */
export interface QuestionDraft {
  title: string;
  body: string;
  category?: string;
}

/** 아바타 색 팔레트 — 사람마다 같은 색이 나오도록 이름 해시로 고른다. */
const COLORS = ['#5C6BC0', '#26A69A', '#F2B705', '#E2574C', '#7E57C2', '#8D6E63'];

/**
 * 이름 → 아바타 색. 서버는 색을 모르고, 알 필요도 없다(표현 계층의 문제).
 * 같은 사람이 화면마다 다른 색으로 보이지 않도록 이름에서 결정론적으로 뽑는다.
 */
export function authorColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

/** 절대 시각 → 경과 분. 화면의 '몇 분 전' 표기는 렌더 시점에 계산해야 한다. */
export function minutesSince(createdAt: number, now = Date.now()): number {
  return Math.max(0, Math.floor((now - createdAt) / 60_000));
}

/** 질문 목록에서 파생 카운터를 다시 계산한다(목업·로컬 편집 후 사용). */
export function withDerivedCounts(q: Omit<Question, 'answerCount' | 'myAnswerCount' | 'solved'>): Question {
  return {
    ...q,
    answerCount: q.answers.length,
    myAnswerCount: q.answers.filter((a) => a.mine).length,
    solved: q.answers.some((a) => a.accepted),
  };
}
