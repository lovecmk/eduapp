// 서버 라우트가 열리는 날 앱 재배포 없이 붙는가 — 자랑 피드·현장 팁·체감 난이도.
//
// 규칙(_fallback): 라우트가 없으면(404) 이 기기 안에서 돌며 강등을 기록하고(화면 안내),
// 라우트가 생기면 다음 확인부터 서버 데이터를 쓰고 강등을 지운다.
// 그리고 폴백은 **남의 데이터를 지어내지 않는다**(체감 난이도 분포 = null).

jest.mock('../../network/env', () => ({
  env: {
    useMockData: false,
    apiBaseUrl: 'https://api.test',
    apiTimeoutMs: 5000,
    build: { version: '1.0.0', buildNumber: 1, commit: 'test' },
  },
}));

import { feedRepository, tipRepository, difficultyPollRepository } from '../index';
import { setLogSink, resetLogSink } from '../../../utils/logger';
import { useTipStore } from '../../../store/tipStore';
import { useDiffPollStore } from '../../../store/diffPollStore';

const resp = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => (body === undefined ? '' : JSON.stringify(body)),
});

let routes: Record<string, () => ReturnType<typeof resp>> = {};
beforeAll(() => setLogSink(() => {}));
afterAll(() => resetLogSink());
beforeEach(() => {
  routes = {};
  useTipStore.setState({ tips: [] });
  useDiffPollStore.setState({ myVotes: {} });
  global.fetch = jest.fn(async (url: string) => {
    const path = String(url).replace('https://api.test', '').split('?')[0];
    return (routes[path] ?? (() => resp(404, { message: 'not found' })))();
  }) as unknown as typeof fetch;
});

describe('missing endpoints report errors without local or mock writes', () => {
  it('does not accept tips or votes and does not fabricate a feed', async () => {
    await expect(tipRepository.add('lc001', '현장 팁')).rejects.toMatchObject({ status: 404 });
    await expect(difficultyPollRepository.vote('lc001', 'hard')).rejects.toMatchObject({ status: 404 });
    await expect(feedRepository.list()).rejects.toMatchObject({ status: 404 });
    expect(useTipStore.getState().tips).toEqual([]);
    expect(useDiffPollStore.getState().myVotes).toEqual({});
  });
});

describe('라우트가 열리면 — 재배포 없이 서버를 쓴다', () => {
  it('다음 확인 시각이 지나면 서버 목록으로 바뀌고 강등이 지워진다', async () => {
    // 앞 테스트가 남긴 강등 창을 지나도록 시간을 민 뒤 시작한다.
    const now = Date.now() + 10 * 1000;
    const spy = jest.spyOn(Date, 'now').mockReturnValue(now);
    await expect(feedRepository.list()).rejects.toMatchObject({ status: 404 });

    routes['/inner/api/v1/feed'] = () =>
      resp(200, [{ id: 7, author_nm: '박현장', snapshot: { title: '전기 스페셜리스트' }, reactions: { clap: 3 }, my_reactions: ['clap'], created_at: '2026-09-30T00:00:00.000Z' }]);
    spy.mockReturnValue(now + 1000 + 1);

    const posts = await feedRepository.list();
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ id: '7', author: '박현장', myReactions: ['clap'] });
    expect(posts[0].reactions.clap).toBe(3);
    spy.mockRestore();
  });

  it('체감 난이도: 서버가 주는 분포를 그대로 쓴다', async () => {
    routes['/inner/api/v1/cards/lc002/difficulty'] = () => resp(200, { easy: 4, normal: 10, hard: 2, mine: 'normal' });
    // 앞 테스트의 강등 창이 모듈에 남아 있을 수 있어 시간을 앞으로 민다.
    const spy = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 30 * 1000);
    const summary = await difficultyPollRepository.get('lc002');
    spy.mockRestore();
    expect(summary).toEqual({ counts: { easy: 4, normal: 10, hard: 2 }, mine: 'normal' });
  });
});
