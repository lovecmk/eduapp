import { logger, setLogSink, resetLogSink, type LogRecord } from '../logger';

(globalThis as unknown as { __DEV__: boolean }).__DEV__ = true;

describe('logger', () => {
  let records: LogRecord[];

  beforeEach(() => {
    records = [];
    setLogSink((r) => records.push(r));
  });
  afterEach(() => resetLogSink());

  it('구조화 레코드(level/event/timestamp/fields)를 남긴다', () => {
    logger.info('health_check', { ok: true, latencyMs: 12 });
    expect(records).toHaveLength(1);
    expect(records[0].level).toBe('info');
    expect(records[0].event).toBe('health_check');
    expect(records[0].fields).toEqual({ ok: true, latencyMs: 12 });
    expect(() => new Date(records[0].timestamp).toISOString()).not.toThrow();
  });

  it('레벨별 메서드가 각각 동작한다', () => {
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    expect(records.map((r) => r.level)).toEqual(['debug', 'info', 'warn', 'error']);
  });

  it('민감정보 키(password/token/secret/authorization/apiKey)는 마스킹한다', () => {
    logger.error('login_failed', {
      password: 'hunter2',
      accessToken: 'abc',
      refresh_token: 'xyz',
      apiKey: 'k',
      Authorization: 'Bearer x',
      userId: 'u-1',
    });
    const f = records[0].fields;
    expect(f.password).toBe('***');
    expect(f.accessToken).toBe('***');
    expect(f.refresh_token).toBe('***');
    expect(f.apiKey).toBe('***');
    expect(f.Authorization).toBe('***');
    expect(f.userId).toBe('u-1'); // 민감하지 않은 값은 보존
  });

  it('중첩된 객체·배열 안의 민감정보까지 마스킹한다', () => {
    logger.error('login_failed', {
      request: { body: { password: 'hunter2', userId: 'u-1' } },
      attempts: [{ accessToken: 'a' }, { accessToken: 'b' }],
    });
    const f = records[0].fields as Record<string, any>;
    // 한 겹만 감싸도 새어 나가면 로그 수집기에 평문이 영구 보존된다.
    expect(f.request.body.password).toBe('***');
    expect(f.request.body.userId).toBe('u-1');
    expect(f.attempts.map((a: any) => a.accessToken)).toEqual(['***', '***']);
  });

  it('깊이가 과하면 잘라낸다(순환 참조·거대 객체로 로깅이 멈추지 않게)', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => logger.info('cycle', { cyclic })).not.toThrow();
  });

  it('Date 같은 비평면 객체는 구조를 헤집지 않는다', () => {
    const at = new Date('2026-01-01T00:00:00.000Z');
    logger.info('scheduled', { at });
    expect((records[0].fields as Record<string, unknown>).at).toBe(at);
  });

  it('fields 없이 호출해도 안전하다', () => {
    logger.info('app_start');
    expect(records[0].fields).toEqual({});
  });

  it('__DEV__ 가 false 면 debug 로그는 남기지 않는다', () => {
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
    logger.debug('noisy');
    logger.info('kept');
    expect(records.map((r) => r.event)).toEqual(['kept']);
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = true;
  });
});
