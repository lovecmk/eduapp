// 서버가 주는 값만 그린다 — 진영 대항전 집계 · 알림 숨김.
//
// 과거 결함: 진영별 기여는 서버에 없는 값이었고, 앱이 전체 문제 수를 고정 비율
// (35/34/31%)에 난수를 섞어 세 진영으로 나눠 그렸다. 서버가 집계를 주지 않으면
// 비워 두고(화면은 '집계 준비 중'), 주면 그대로 쓴다.

jest.mock('../../network/env', () => ({
  env: { useMockData: false, apiBaseUrl: 'https://api.test', apiTimeoutMs: 5000 },
}));
jest.mock('../../storage/secureStorage', () => ({
  StorageKeys: { accessToken: 'accessToken', refreshToken: 'refreshToken' },
  secureStorage: {
    getItem: () => Promise.resolve('tok'),
    setItem: () => Promise.resolve(),
    removeItem: () => Promise.resolve(),
  },
}));
jest.mock('../../network/offlineQueue', () => ({
  enqueue: jest.fn(() => Promise.resolve()),
  flushQueue: jest.fn(() => Promise.resolve(0)),
  setQueueSender: jest.fn(),
}));

import { CommunityRepository } from '../CommunityRepository';
import { NotificationRepository } from '../NotificationRepository';
import { setLogSink, resetLogSink } from '../../../utils/logger';

const resp = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => (body === undefined ? '' : JSON.stringify(body)),
});

const base = {
  online_now: 3, studied_today: 1, total_minutes_today: 10, daily_goal_minutes: 100,
  companions: [], activities: [],
};

beforeAll(() => setLogSink(() => {}));
afterAll(() => resetLogSink());

describe('진영 대항전 — 서버 집계', () => {
  it('서버가 진영별 기여를 주면 층수 순으로 그대로 쓴다', async () => {
    global.fetch = jest.fn(async () => resp(200, {
      ...base,
      building: {
        floor_size: 100,
        current: {
          month: '2026-09', label: '9월', problems: 900, floors: 9, winner: 'flame',
          factions: [
            { faction_cd: 'frost', problems: 250 },
            { faction_cd: 'flame', problems: 450 },
            { faction_cd: 'volt', problems: 200 },
            { faction_cd: 'nope', problems: 999 },
          ],
        },
        history: [],
      },
    })) as unknown as typeof fetch;

    const snap = await new CommunityRepository().getSnapshot();
    expect(snap.building.current.factions).toEqual([
      { id: 'flame', problems: 450, floors: 4 },
      { id: 'frost', problems: 250, floors: 2 },
      { id: 'volt', problems: 200, floors: 2 },
    ]);
  });

  it('서버가 주지 않으면 비워 둔다(지어내지 않는다)', async () => {
    global.fetch = jest.fn(async () => resp(200, {
      ...base,
      building: { floor_size: 100, current: { month: '2026-09', label: '9월', problems: 900, floors: 9 }, history: [] },
    })) as unknown as typeof fetch;

    const snap = await new CommunityRepository().getSnapshot();
    expect(snap.building.current.factions).toBeUndefined();
  });
});

describe('알림 숨김 — 라우트가 없어도 동기화를 흔들지 않는다', () => {
  it('404 는 삼킨다(기기에는 지운 기록이 이미 있다)', async () => {
    global.fetch = jest.fn(async () => resp(404, {})) as unknown as typeof fetch;
    await expect(new NotificationRepository().dismiss(['n1'])).resolves.toBeUndefined();
  });

  it('라우트가 있으면 정렬된 id 로 한 번 보낸다', async () => {
    const calls: { url: string; body: string }[] = [];
    global.fetch = jest.fn(async (url: string, init: { body: string }) => {
      calls.push({ url, body: init.body });
      return resp(200, {});
    }) as unknown as typeof fetch;
    await new NotificationRepository().dismiss(['b', 'a']);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.test/inner/api/v1/notifications/dismiss');
    expect(JSON.parse(calls[0].body)).toEqual({ ids: ['a', 'b'] });
  });
});
