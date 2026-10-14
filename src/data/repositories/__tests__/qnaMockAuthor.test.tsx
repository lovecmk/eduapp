// 목업 Q&A 의 작성자 이름 — 실서버와 같은 규칙을 지키는지.
//
// 이 앱은 서버 라우트가 없으면 목업 저장소로 떨어진다. 두 경로가 이름을 다르게
// 다루면 서버가 붙는 날 화면이 갑자기 달라지는데, 그건 버그로 보이지 않고
// "왜 이름이 바뀌었지"로 보인다. 여기서 지키는 것은 두 가지다.
//
//   1) 커뮤니티에 나가는 이름은 **닉네임**이다(본명이 아니다).
//   2) 닉네임을 바꾸면 이미 올린 글의 이름도 함께 바뀐다.

import { useAuthStore } from '../../../store/authStore';
import { useQnaStore, resetQnaStore } from '../../../store/qnaStore';
import { MockQnaRepository } from '../../../__tests__/fixtures/data/repositories/QnaRepository.mock';
import type { User } from '../../../domain/models/User';

const repo = new MockQnaRepository();

function signIn(over: Partial<User> = {}): void {
  useAuthStore.setState({
    user: {
      id: 'u1', name: '김진섭', nickname: '불끄는진섭', email: 'a@b.c',
      membership: 'basic', isAdmin: false, createdAt: new Date(), isActive: true,
      ...over,
    },
  });
}

beforeEach(() => {
  resetQnaStore();
  signIn();
});

it('커뮤니티에 나가는 이름은 본명이 아니라 닉네임이다', async () => {
  const q = await repo.ask({ title: '분전반 발열', body: '82도가 나왔습니다' });
  expect(q.author).toBe('불끄는진섭');
  // 저장된 폴백 값도 닉네임이어야 한다 — 여기가 본명이면 언젠가 화면에 샌다.
  expect(useQnaStore.getState().questions[0].author).toBe('불끄는진섭');
});

it('닉네임이 없으면 이름으로 대신한다', async () => {
  signIn({ nickname: undefined });
  const q = await repo.ask({ title: '분전반 발열', body: '82도가 나왔습니다' });
  expect(q.author).toBe('김진섭');
});

it('닉네임을 바꾸면 이미 올린 질문의 이름도 함께 바뀐다', async () => {
  const created = await repo.ask({ title: '분전반 발열', body: '82도가 나왔습니다' });

  signIn({ nickname: '진섭' });

  const [listed] = await repo.list();
  expect(listed.author).toBe('진섭');
  const detail = await repo.get(created.id);
  expect(detail?.author).toBe('진섭');
});

it('닉네임을 바꾸면 내가 단 답변의 이름도 함께 바뀐다', async () => {
  const created = await repo.ask({ title: '분전반 발열', body: '82도가 나왔습니다' });
  await repo.answer(created.id, '즉시 정지 대상입니다');

  signIn({ nickname: '진섭' });

  const detail = await repo.get(created.id);
  expect(detail?.answers).toHaveLength(1);
  expect(detail?.answers[0].author).toBe('진섭');
});

it('이름이 바뀌면 아바타 색도 함께 바뀐다', async () => {
  const created = await repo.ask({ title: '분전반 발열', body: '82도가 나왔습니다' });
  const before = created.color;

  signIn({ nickname: '전혀다른닉네임' });

  const [listed] = await repo.list();
  // 색은 이름에서 결정론적으로 뽑는다 — 이름만 고치고 색을 두면 같은 사람이
  // 목록과 상세에서 다른 색으로 보인다.
  expect(listed.color).not.toBe(before);
  expect(listed.color).toBe((await repo.get(created.id))?.color);
});

it('내 글이 아니면 저장된 이름을 그대로 둔다', async () => {
  // 남이 쓴 글(mine=false)이 스토어에 있는 상황 — 그 사람의 지금 이름은 알 수 없다.
  useQnaStore.setState({
    questions: [{
      id: 'q-other', author: '이안전', color: '#000', title: '제목', body: '본문',
      answers: [], answerCount: 0, myAnswerCount: 0, solved: false,
      likes: 0, likedByMe: false, mine: false, createdAt: Date.now(),
    }],
  });

  signIn({ nickname: '진섭' });

  const [listed] = await repo.list();
  expect(listed.author).toBe('이안전');
});

it('로그아웃 상태에서도 목록이 열린다', async () => {
  await repo.ask({ title: '분전반 발열', body: '82도가 나왔습니다' });
  useAuthStore.setState({ user: null });

  const list = await repo.list();
  // 지금 이름을 알 수 없으면 글에 적힌 이름으로 돌아간다(서버의 폴백과 같다).
  expect(list[0].author).toBe('불끄는진섭');
});
