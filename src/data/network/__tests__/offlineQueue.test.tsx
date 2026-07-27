// AsyncStorage 에 의존하므로 components 프로젝트(jest-expo)에서 돌린다.
import {
  enqueue,
  flushQueue,
  pendingCount,
  clearQueue,
  setQueueSender,
  __resetQueueForTests,
  MAX_ATTEMPTS,
  type QueuedWrite,
} from '../offlineQueue';
import { ApiError } from '../errors';
import { setLogSink, resetLogSink } from '../../../utils/logger';

beforeAll(() => setLogSink(() => {}));
afterAll(() => resetLogSink());

beforeEach(async () => {
  __resetQueueForTests();
  await clearQueue();
});

describe('오프라인 쓰기 큐', () => {
  it('쓰기를 쌓고 개수를 알려준다', async () => {
    await enqueue('POST', '/api/progress/attendance', { day: '2026-7-25' });
    await enqueue('POST', '/api/reports', { card_id: 'c1' });
    expect(await pendingCount()).toBe(2);
  });

  it('전송이 성공하면 큐에서 빠진다', async () => {
    const sent: string[] = [];
    setQueueSender(async (i: QueuedWrite) => { sent.push(i.path); });
    await enqueue('POST', '/api/a', {});
    await enqueue('POST', '/api/b', {});
    expect(await flushQueue()).toBe(2);
    expect(sent).toEqual(['/api/a', '/api/b']);
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
    await enqueue('POST', '/api/a', {});
    await enqueue('POST', '/api/b', {});
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

  it('일시적 실패가 반복되면 최대 시도 횟수에서 포기한다', async () => {
    setQueueSender(async () => { throw new ApiError(503, ''); });
    await enqueue('POST', '/flaky', {});
    for (let i = 0; i < MAX_ATTEMPTS; i++) await flushQueue();
    expect(await pendingCount()).toBe(0); // 무한히 큐를 막지 않는다
  });

  it('멱등키를 지정하면 그대로 보존한다(서버 중복 반영 방지)', async () => {
    const keys: string[] = [];
    setQueueSender(async (i: QueuedWrite) => { keys.push(i.idempotencyKey); });
    await enqueue('POST', '/api/progress/attendance', { day: 'd' }, 'attendance:2026-7-25');
    await flushQueue();
    expect(keys).toEqual(['attendance:2026-7-25']);
  });

  it('전송기가 없으면 아무것도 보내지 않는다(초기화 전 안전)', async () => {
    __resetQueueForTests();
    await enqueue('POST', '/api/a', {});
    expect(await flushQueue()).toBe(0);
  });

  it('clearQueue 는 대기 항목을 모두 비운다(로그아웃 시)', async () => {
    await enqueue('POST', '/api/a', {});
    await clearQueue();
    expect(await pendingCount()).toBe(0);
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
