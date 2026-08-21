// 질문 & 답변 매핑 — 서버 응답이 화면까지 오는 길.
//
// 목록 응답에는 답변 본문이 없다. 그때도 '답변 3개'·'해결됨'·'내 기여'가 맞아야
// 하므로 카운터는 서버 값을 쓰고, 없을 때만 답변 배열에서 센다. 이 규칙이
// 뒤집히면 목록의 모든 질문이 답변 0개로 보인다(= 아무도 답을 안 다는 커뮤니티).

const get = jest.fn();
const post = jest.fn();
const postDurable = jest.fn();

jest.mock('../../network/ApiClient', () => ({
  apiClient: {
    get: (...a: unknown[]) => get(...a) as unknown,
    post: (...a: unknown[]) => post(...a) as unknown,
    postDurable: (...a: unknown[]) => postDurable(...a) as unknown,
  },
}));

import { QnaRepository } from '../QnaRepository';
import { authorColor, minutesSince, withDerivedCounts } from '../../../domain/models/Qna';

const repo = new QnaRepository();

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  postDurable.mockReset();
});

describe('QnaRepository — 목록', () => {
  it('서버 카운터를 그대로 쓴다(본문이 없어도 개수가 맞는다)', async () => {
    get.mockResolvedValue([
      {
        id: 'q1', author_nm: '이안전', category_nm: '전기 위험',
        title_txt: '제목', body_txt: '본문',
        like_cnt: 5, liked_yn: true, mine_yn: false,
        answer_cnt: 3, my_answer_cnt: 1, solved_yn: true,
        created_at: '2026-08-14T00:00:00.000Z',
      },
    ]);
    const [q] = await repo.list();
    expect(q.answers).toEqual([]);
    expect(q.answerCount).toBe(3);
    expect(q.myAnswerCount).toBe(1);
    expect(q.solved).toBe(true);
    expect(q.likedByMe).toBe(true);
  });

  it('카운터가 없으면 답변 배열에서 센다(구버전 서버 호환)', async () => {
    get.mockResolvedValue({
      items: [
        {
          id: 'q1', author_nm: '이안전', title_txt: '제목',
          answers: [
            { id: 'a1', author_nm: '나', body_txt: 'ㅇㅇ', mine_yn: true, accepted_yn: true },
            { id: 'a2', author_nm: '남', body_txt: 'ㄴㄴ' },
          ],
        },
      ],
    });
    const [q] = await repo.list();
    expect(q.answerCount).toBe(2);
    expect(q.myAnswerCount).toBe(1);
    expect(q.solved).toBe(true);
  });

  it('배열 응답과 { items } 응답을 모두 받는다', async () => {
    get.mockResolvedValue({ items: [{ id: 'q1' }] });
    expect(await repo.list()).toHaveLength(1);
    get.mockResolvedValue([{ id: 'q1' }, { id: 'q2' }]);
    expect(await repo.list()).toHaveLength(2);
  });

  it('작성자 이름이 비어도 화면이 깨지지 않는다', async () => {
    get.mockResolvedValue([{ id: 'q1', author_nm: '   ' }]);
    const [q] = await repo.list();
    expect(q.author).toBe('익명');
    expect(q.color).toBe(authorColor('익명'));
  });

  it('시각을 못 읽으면 "방금"으로 둔다(1970년으로 밀려 목록 끝에 가지 않게)', async () => {
    get.mockResolvedValue([{ id: 'q1', created_at: 'garbage' }]);
    const [q] = await repo.list();
    expect(minutesSince(q.createdAt)).toBe(0);
  });
});

describe('QnaRepository — 상세·쓰기', () => {
  it('없는 질문은 null', async () => {
    get.mockResolvedValue(null);
    expect(await repo.get('nope')).toBeNull();
  });

  it('질문 등록은 응답을 기다린다(서버가 준 id 로 상세로 이동해야 하므로)', async () => {
    post.mockResolvedValue({ id: 'server-1', title_txt: '제목' });
    const created = await repo.ask({ title: '제목', body: '본문', category: '전기 위험' });
    expect(post).toHaveBeenCalledWith('/inner/api/v1/qna', {
      title_txt: '제목', body_txt: '본문', category_nm: '전기 위험',
    });
    expect(created.id).toBe('server-1');
  });

  it('공감은 오프라인 큐로 보내고, 멱등키에 원하는 상태를 담는다', async () => {
    postDurable.mockResolvedValue('sent');
    await repo.setQuestionLike('q1', true);
    expect(postDurable).toHaveBeenCalledWith('/inner/api/v1/qna/q1/like', { liked: true }, 'qna-like:q1:true');

    await repo.setAnswerLike('q1', 'a2', false);
    expect(postDurable).toHaveBeenCalledWith(
      '/inner/api/v1/qna/q1/answers/a2/like',
      { liked: false },
      'qna-answer-like:a2:false',
    );
  });

  it('id 에 이상한 문자가 있어도 경로가 깨지지 않는다', async () => {
    get.mockResolvedValue(null);
    await repo.get('a/b?c');
    expect(get).toHaveBeenCalledWith('/inner/api/v1/qna/a%2Fb%3Fc');
  });
});

describe('withDerivedCounts', () => {
  it('답변 배열에서 개수·내 답변·해결 여부를 만든다', () => {
    const q = withDerivedCounts({
      id: 'q', author: '나', color: '#000', title: 't', body: 'b',
      answers: [
        { id: 'a1', author: '나', color: '#000', body: 'x', likes: 0, likedByMe: false, mine: true, createdAt: 0, accepted: false },
        { id: 'a2', author: '남', color: '#000', body: 'y', likes: 0, likedByMe: false, mine: false, createdAt: 0, accepted: true },
      ],
      likes: 0, likedByMe: false, mine: false, createdAt: 0,
    });
    expect(q.answerCount).toBe(2);
    expect(q.myAnswerCount).toBe(1);
    expect(q.solved).toBe(true);
  });
});

describe('authorColor', () => {
  it('같은 이름은 언제나 같은 색(화면마다 색이 바뀌지 않게)', () => {
    expect(authorColor('한전기')).toBe(authorColor('한전기'));
  });
});
