// AsyncStorage 에 의존하므로 components 프로젝트(jest-expo)에서 돌린다.
import {
  enqueue,
  flushQueue,
  pendingCount,
  clearQueue,
  setQueueSender,
  setQueueOwner,
  __resetQueueForTests,
  MAX_ATTEMPTS,
  type QueuedWrite,
} from '../offlineQueue';
import { ApiError } from '../errors';
import { setLogSink, resetLogSink } from '../../../utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';

beforeAll(() => setLogSink(() => {}));
afterAll(() => resetLogSink());

beforeEach(async () => {
  __resetQueueForTests();
  await clearQueue();
  setQueueOwner(null);
});

describe('오프라인 쓰기 큐', () => {
  it('세션 변경으로 취소된 요청은 버리지 않고 다음 동기화까지 보존한다', async () => {
    setQueueSender(async () => { throw new ApiError(0, '세션 변경', 'cancelled'); });
    await enqueue('POST', '/inner/api/v1/a', {});
    await enqueue('POST', '/inner/api/v1/b', {});
    expect(await flushQueue()).toBe(0);
    expect(await pendingCount()).toBe(2);
    setQueueSender(async () => {});
    expect(await flushQueue()).toBe(2);
  });
  it('쓰기를 쌓고 개수를 알려준다', async () => {
    await enqueue('POST', '/inner/api/v1/progress/attendance', { day: '2026-7-25' });
    await enqueue('POST', '/inner/api/v1/reports', { card_id: 'c1' });
    expect(await pendingCount()).toBe(2);
  });

  // 접두사가 `/api` → `/inner/api/v1` 로 옮겨진 업데이트를 건너온 기기.
  // 옛 주소로 그대로 나가면 404 → '재시도 무의미' 판정 → 큐가 버린다. 즉 사용자가
  // 이미 찍었다고 믿는 출석이 사라진다. 읽어 들이는 순간 고쳐져야 한다.
  it('구버전이 남긴 옛 접두사(/api/)를 지금 주소로 옮겨 놓는다', async () => {
    __resetQueueForTests();
    await AsyncStorage.setItem('offline-write-queue', JSON.stringify([
      {
        id: 'old-1', method: 'POST', path: '/api/progress/attendance',
        body: { day: '2026-7-25' }, idempotencyKey: 'attendance:2026-7-25',
        createdAt: Date.now(), attempts: 0,
      },
    ]));

    const sent: string[] = [];
    setQueueSender(async (i: QueuedWrite) => { sent.push(i.path); });
    expect(await flushQueue()).toBe(1);
    expect(sent).toEqual(['/inner/api/v1/progress/attendance']);
  });

  it('전송이 성공하면 큐에서 빠진다', async () => {
    const sent: string[] = [];
    setQueueSender(async (i: QueuedWrite) => { sent.push(i.path); });
    await enqueue('POST', '/inner/api/v1/a', {});
    await enqueue('POST', '/inner/api/v1/b', {});
    expect(await flushQueue()).toBe(2);
    expect(sent).toEqual(['/inner/api/v1/a', '/inner/api/v1/b']);
    expect(await pendingCount()).toBe(0);
  });

  it('전송 순서를 보존한다(먼저 넣은 것이 먼저 나간다)', async () => {
    const sent: string[] = [];
    setQueueSender(async (i: QueuedWrite) => { sent.push(i.path); });
    for (const p of ['/1', '/2', '/3']) await enqueue('POST', p, {});
    await flushQueue();
    expect(sent).toEqual(['/1', '/2', '/3']);
  });

  it('일시적 실패(오프라인)면 큐에 남기고 그 자리에서 멈춘다', async () => {
    setQueueSender(async () => { throw new ApiError(0, ''); });
    await enqueue('POST', '/inner/api/v1/a', {});
    await enqueue('POST', '/inner/api/v1/b', {});
    expect(await flushQueue()).toBe(0);
    expect(await pendingCount()).toBe(2); // 순서 보존을 위해 뒤 항목도 건드리지 않는다
  });

  it('다시 보내도 실패할 오류(400)는 버리고 다음으로 넘어간다', async () => {
    const seen: string[] = [];
    setQueueSender(async (i: QueuedWrite) => {
      seen.push(i.path);
      if (i.path === '/bad') throw new ApiError(400, '잘못된 요청');
    });
    await enqueue('POST', '/bad', {});
    await enqueue('POST', '/good', {});
    const sent = await flushQueue();
    expect(sent).toBe(1);              // /good 만 성공
    expect(seen).toEqual(['/bad', '/good']);
    expect(await pendingCount()).toBe(0); // /bad 는 폐기
  });

  it('서버가 계속 거절하면(5xx) 최대 시도 횟수에서 포기한다', async () => {
    setQueueSender(async () => { throw new ApiError(503, ''); });
    await enqueue('POST', '/flaky', {});
    for (let i = 0; i < MAX_ATTEMPTS; i++) await flushQueue();
    expect(await pendingCount()).toBe(0); // 무한히 큐를 막지 않는다
  });

  /**
   * 이 앱이 가장 자주 놓이는 상황에서 큐가 제 일을 하는지.
   *
   * 큐는 앱이 앞으로 나올 때마다 흘려보낸다(useAppResume). 연결 없음을 '시도'로
   * 세면, 지하 현장에서 앱을 다섯 번 열기만 해도 **서버에 한 번도 닿아 보지 못한**
   * 출석 도장이 '너무 많이 실패했다'며 버려진다. 유실을 막으려고 만든 큐가
   * 유실의 원인이 되는 셈이다.
   */
  it('연결이 없는 동안에는 아무리 여러 번 흘려보내도 버리지 않는다', async () => {
    setQueueSender(async () => { throw new ApiError(0, '연결 없음'); });
    await enqueue('POST', '/inner/api/v1/progress/attendance', { day: '2026-7-25' });

    for (let i = 0; i < MAX_ATTEMPTS * 3; i++) await flushQueue();
    expect(await pendingCount()).toBe(1);

    // 지상으로 나왔다 → 그동안 기다린 기록이 그대로 나간다.
    const sent: string[] = [];
    setQueueSender(async (q: QueuedWrite) => { sent.push(q.path); });
    await flushQueue();
    expect(sent).toEqual(['/inner/api/v1/progress/attendance']);
    expect(await pendingCount()).toBe(0);
  });

  it('연결이 없다가 서버가 거절하기 시작하면 그때부터 시도를 센다', async () => {
    await enqueue('POST', '/flaky', {});

    setQueueSender(async () => { throw new ApiError(0, '연결 없음'); });
    for (let i = 0; i < MAX_ATTEMPTS * 2; i++) await flushQueue();
    expect(await pendingCount()).toBe(1);

    setQueueSender(async () => { throw new ApiError(503, ''); });
    for (let i = 0; i < MAX_ATTEMPTS; i++) await flushQueue();
    expect(await pendingCount()).toBe(0);
  });

  it('멱등키를 지정하면 그대로 보존한다(서버 중복 반영 방지)', async () => {
    const keys: string[] = [];
    setQueueSender(async (i: QueuedWrite) => { keys.push(i.idempotencyKey); });
    await enqueue('POST', '/inner/api/v1/progress/attendance', { day: 'd' }, 'attendance:2026-7-25');
    await flushQueue();
    expect(keys).toEqual(['attendance:2026-7-25']);
  });

  it('전송기가 없으면 아무것도 보내지 않는다(초기화 전 안전)', async () => {
    __resetQueueForTests();
    await enqueue('POST', '/inner/api/v1/a', {});
    expect(await flushQueue()).toBe(0);
  });

  it('clearQueue 는 대기 항목을 모두 비운다(로그아웃 시)', async () => {
    await enqueue('POST', '/inner/api/v1/a', {});
    await clearQueue();
    expect(await pendingCount()).toBe(0);
  });

  // 현장 태블릿은 여러 명이 돌려 쓴다. 앞사람이 오프라인에서 남긴 기록이
  // 뒷사람 토큰으로 나가면 안전교육 이력이 엉뚱한 계정에 붙는다.
  describe('사용자 격리', () => {
    it('앞사람이 남긴 쓰기를 뒷사람 세션에서 보내지 않는다', async () => {
      const sent: string[] = [];
      setQueueSender(async (i: QueuedWrite) => { sent.push(i.path); });

      setQueueOwner('user-a');
      await enqueue('POST', '/inner/api/v1/progress/attendance', { day: 'd' });

      // A 로그아웃 → B 로그인
      setQueueOwner(null);
      setQueueOwner('user-b');
      await enqueue('POST', '/inner/api/v1/reports', { card_id: 'c1' });

      expect(await flushQueue()).toBe(1);
      expect(sent).toEqual(['/inner/api/v1/reports']); // A 의 출석은 건드리지 않는다
      expect(await pendingCount()).toBe(1);
    });

    it('본인이 다시 로그인하면 남겨 둔 쓰기가 그때 전송된다', async () => {
      const sent: string[] = [];
      setQueueSender(async (i: QueuedWrite) => { sent.push(i.path); });

      setQueueOwner('user-a');
      await enqueue('POST', '/inner/api/v1/progress/attendance', { day: 'd' });

      setQueueOwner('user-b');
      expect(await flushQueue()).toBe(0); // B 세션에서는 아무것도 안 나간다

      setQueueOwner('user-a'); // A 가 돌아왔다
      expect(await flushQueue()).toBe(1);
      expect(sent).toEqual(['/inner/api/v1/progress/attendance']);
    });

    it('로그인 전에 쌓인 쓰기(주인 없음)는 누구 세션에서든 나간다', async () => {
      const sent: string[] = [];
      setQueueSender(async (i: QueuedWrite) => { sent.push(i.path); });

      await enqueue('POST', '/inner/api/v1/anon', {}); // 주인 미지정
      setQueueOwner('user-a');
      expect(await flushQueue()).toBe(1);
      expect(sent).toEqual(['/inner/api/v1/anon']);
    });
  });

  describe('동시 접근 (유실 방지)', () => {
    it('최초 로드 중에 들어온 쓰기를 잃지 않는다', async () => {
      // 디스크에 이미 한 건이 있는 상태를 만든다.
      await enqueue('POST', '/disk', {});
      // 캐시를 비워 다음 접근이 '디스크에서 처음 읽는' 상황이 되게 한다.
      __resetQueueForTests();

      // 읽기(pendingCount)가 디스크를 읽는 **도중에** 쓰기(enqueue)가 들어온다.
      // 로드가 직렬화되지 않으면, 뒤늦게 도착한 디스크 내용이 memory 를 통째로
      // 덮어써 방금 넣은 항목이 사라진다(순서가 이쪽일 때만 드러나는 경쟁 조건).
      const reading = pendingCount();
      const writing = enqueue('POST', '/during-load', {});
      await Promise.all([reading, writing]);
      expect(await pendingCount()).toBe(2); // 디스크 1건 + 로드 중 1건
    });

    it('전송 중 로그아웃(clearQueue)이 끼어들어도 남의 기록을 지우지 않는다', async () => {
      let release: (() => void) | null = null;
      const inFlight = new Promise<void>((r) => { release = r; });
      const sent: string[] = [];

      setQueueSender(async (i: QueuedWrite) => {
        sent.push(i.path);
        if (i.path === '/slow') await inFlight; // 첫 항목 전송을 붙잡아 둔다
      });

      await enqueue('POST', '/slow', {});
      const flushing = flushQueue();

      // 전송을 기다리는 사이 로그아웃으로 큐가 비워지고, 새 사용자가 쓰기를 남긴다.
      await clearQueue();
      await enqueue('POST', '/new-user', {});

      release!();
      await flushing;

      // 맨 앞(shift)을 잘라내는 방식이면, /slow 성공 처리가 맨 앞에 와 있던
      // /new-user 를 **보내지도 않고** 지운다(sent=['/slow'], 대기 0건 → 유실).
      // id 로 지우면 /new-user 는 제 차례에 정상 전송된다.
      expect(sent).toContain('/new-user');
      expect(await pendingCount()).toBe(0);
    });
  });
});


it('keeps queued learning bound to its original live server', async () => {
  setQueueOwner('a', 'live:server-a');
  await enqueue('POST', '/inner/api/v1/progress/grade', { card_id: 'real-card' });
  const send = jest.fn(async () => {});
  setQueueSender(send);
  setQueueOwner('a', 'mock');
  expect(await flushQueue()).toBe(0);
  setQueueOwner('a', 'live:server-b');
  expect(await flushQueue()).toBe(0);
  expect(await pendingCount()).toBe(1);
  setQueueOwner('a', 'live:server-a');
  expect(await flushQueue()).toBe(1);
  expect(send).toHaveBeenCalledTimes(1);
});
