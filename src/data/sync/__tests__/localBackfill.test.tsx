// 서버가 열리면 기기에만 있던 것이 옮겨지는가 — 그리고 옮긴 것만 지워지는가.
//
// 과거(이번 변경 전) 흐름: 서버가 열리는 순간 화면은 서버 목록을 그리고, 그 전에
// 기기에 남긴 성취 카드·질문·팁은 조용히 사라졌다.

import { runLocalBackfill, __resetBackfillForTests, type LiveRepos } from '../localBackfill';
import { useShareFeedStore } from '../../../store/shareFeedStore';
import { useTipStore } from '../../../store/tipStore';
import { useDiffPollStore } from '../../../store/diffPollStore';
import { useQnaStore } from '../../../store/qnaStore';
import { useNotificationStore } from '../../../store/notificationStore';
import { ApiError } from '../../network/errors';
import { advanceSessionEpoch } from '../../network/sessionEpoch';

const notDeployed = () => Promise.reject(new ApiError(404, ''));

function fakeLive(over: Partial<{ [K in keyof LiveRepos]: Partial<LiveRepos[K]> }> = {}): LiveRepos {
  return {
    feed: { list: jest.fn(), post: jest.fn(async () => ({}) as never), setReaction: jest.fn(), ...over.feed },
    tips: { list: jest.fn(), add: jest.fn(async () => ({}) as never), setLike: jest.fn(), remove: jest.fn(), ...over.tips },
    poll: { get: jest.fn(), vote: jest.fn(async () => {}), ...over.poll },
    qna: {
      list: jest.fn(), get: jest.fn(), setQuestionLike: jest.fn(), setAnswerLike: jest.fn(),
      ask: jest.fn(async () => ({ id: 'srv-q1' }) as never),
      answer: jest.fn(async () => ({}) as never),
      ...over.qna,
    },
    notifications: {
      list: jest.fn(), markRead: jest.fn(), markAllRead: jest.fn(), registerPushToken: jest.fn(),
      dismiss: jest.fn(async () => {}),
      ...over.notifications,
    },
  } as unknown as LiveRepos;
}

const post = (id: string, mine = true) => ({
  id, author: '나', color: '#000', imageUri: null, aspect: 0.8, snapshot: {} as never,
  likes: 0, likedByMe: false, reactions: { clap: 0, fire: 0, up: 0 }, myReactions: [], mine, minutesAgo: 0,
});

beforeEach(() => {
  __resetBackfillForTests();
  useShareFeedStore.setState({ posts: [] });
  useTipStore.setState({ tips: [] });
  useDiffPollStore.setState({ myVotes: {}, sent: {} });
  useQnaStore.setState({ questions: [] });
  useNotificationStore.setState({ dismissedIds: [] });
});

describe('runLocalBackfill', () => {
  it('계정이 바뀌면 이전 전송 결과로 새 계정 데이터를 삭제하거나 추가 전송하지 않는다', async () => {
    useShareFeedStore.setState({ posts: [post('mybrag-1')] });
    let finish!: () => void;
    const live = fakeLive({ feed: { post: jest.fn(() => new Promise<void>((resolve) => { finish = resolve; })) as never } });
    const job = runLocalBackfill(live);
    advanceSessionEpoch();
    useShareFeedStore.setState({ posts: [post('mybrag-1')] });
    useDiffPollStore.setState({ myVotes: { lc001: 'hard' }, sent: {} });
    finish();
    const result = await job;
    expect(useShareFeedStore.getState().posts).toHaveLength(1);
    expect(live.poll.vote).not.toHaveBeenCalled();
    expect(result.feed).toBe(0);
  });
  it('기기에서 만든 것만 오래된 순서로 올리고, 올린 것은 기기에서 지운다', async () => {
    useShareFeedStore.setState({ posts: [post('mybrag-2'), post('mybrag-1'), post('brag-seed', false)] });
    useTipStore.setState({ tips: [{ id: 'mine-1', cardId: 'lc001', author: '나', color: '#000', body: '방전 먼저', likes: 0, likedByMe: false, mine: true, minutesAgo: 0 }] });
    useDiffPollStore.setState({ myVotes: { lc001: 'hard', lc002: 'easy' }, sent: { lc002: 'easy' } });
    const live = fakeLive();

    const r = await runLocalBackfill(live);

    expect((live.feed.post as jest.Mock).mock.calls).toHaveLength(2);
    expect(useShareFeedStore.getState().posts.map((p) => p.id)).toEqual(['brag-seed']);
    expect(live.tips.add).toHaveBeenCalledWith('lc001', '방전 먼저');
    expect(r.tips).toEqual(['lc001']);
    expect(useTipStore.getState().tips).toEqual([]);
    // 이미 서버가 받은 표(lc002)는 다시 보내지 않는다.
    expect(live.poll.vote).toHaveBeenCalledTimes(1);
    expect(live.poll.vote).toHaveBeenCalledWith('lc001', 'hard');
    expect(useDiffPollStore.getState().sent).toEqual({ lc001: 'hard', lc002: 'easy' });
  });

  it('내 질문은 내 답변과 함께 옮긴다', async () => {
    useQnaStore.setState({
      questions: [{
        id: 'myq-1', author: '나', color: '#000', title: '접지 저항 기준?', body: '몇 옴 이하인가요', category: '전기 위험',
        answers: [{ id: 'mya-1', author: '나', color: '#000', body: '보충: 특3종 기준', likes: 0, likedByMe: false, mine: true, createdAt: 1, accepted: false }],
        answerCount: 1, myAnswerCount: 1, solved: false, likes: 0, likedByMe: false, mine: true, createdAt: 1,
      }] as never,
    });
    const live = fakeLive();
    const r = await runLocalBackfill(live);
    expect(live.qna.ask).toHaveBeenCalledWith({ title: '접지 저항 기준?', body: '몇 옴 이하인가요', category: '전기 위험' });
    expect(live.qna.answer).toHaveBeenCalledWith('srv-q1', '보충: 특3종 기준');
    expect(r.questions).toBe(1);
    expect(useQnaStore.getState().questions).toEqual([]);
  });

  it('아직 라우트가 없는 기능은 기기에 그대로 두고, 다른 기능은 막지 않는다', async () => {
    useShareFeedStore.setState({ posts: [post('mybrag-1')] });
    useDiffPollStore.setState({ myVotes: { lc001: 'normal' }, sent: {} });
    const live = fakeLive({ feed: { post: notDeployed } });

    const r = await runLocalBackfill(live);

    expect(r.feed).toBe(0);
    expect(useShareFeedStore.getState().posts.map((p) => p.id)).toEqual(['mybrag-1']);
    expect(r.votes).toBe(1);
  });

  it('지운 알림은 한 실행에 한 번 통째로 알린다', async () => {
    useNotificationStore.setState({ dismissedIds: ['n1', 'n2'] });
    const live = fakeLive();
    await runLocalBackfill(live);
    await runLocalBackfill(live);
    expect(live.notifications.dismiss).toHaveBeenCalledTimes(1);
    expect(live.notifications.dismiss).toHaveBeenCalledWith(['n1', 'n2']);
  });
});
