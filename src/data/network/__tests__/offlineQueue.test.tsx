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
});
