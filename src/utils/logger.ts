// 구조화 로깅(Structured Logging) — 문자열 조각 대신 필드가 있는 로그를 남긴다.
//
// 왜 필요한가: console.log 로 흩어진 문자열은 운영에서 검색·집계가 불가능하다.
// 여기서 { level, event, ...fields } 형태로 통일해두면, 추후 Sentry/Datadog 등
// 수집기로 보낼 때 이 파일의 sink 만 교체하면 된다(호출부는 그대로).
//
// 개인정보 주의: 토큰·비밀번호·이메일 전문 등 민감정보는 절대 필드에 넣지 말 것.
// (자주 실수하는 키는 redact 로 자동 마스킹한다.)

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
  [key: string]: unknown;
}

/** 자동 마스킹 대상 키(부분 일치, 소문자 비교). */
const SENSITIVE_KEYS = ['password', 'token', 'secret', 'authorization', 'apikey', 'api_key'];

/** 중첩 객체를 따라 내려가는 깊이 한도 — 순환 참조·거대 객체로 로깅이 멈추지 않게 한다. */
const MAX_REDACT_DEPTH = 4;

function isSensitive(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEYS.some((s) => lower.includes(s));
}

/**
 * 민감정보를 가린다. 중첩까지 훑는 이유는 `{ request: { password } }` 처럼
 * 한 겹만 감싸도 최상위 키만 보는 마스킹은 그대로 통과시키기 때문이다.
 */
function redactValue(value: unknown, depth: number): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_REDACT_DEPTH) return '[깊이 초과]';
  if (Array.isArray(value)) return value.map((v) => redactValue(v, depth + 1));
  // Date·Error 등은 구조를 헤집지 않고 그대로 둔다(sink 가 알아서 직렬화한다).
  if (!isPlainObject(value)) return value;
  const out: LogFields = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = isSensitive(k) ? '***' : redactValue(v, depth + 1);
  }
  return out;
}

function isPlainObject(v: object): v is Record<string, unknown> {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function redact(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = isSensitive(k) ? '***' : redactValue(v, 1);
  }
  return out;
}

export interface LogRecord {
  level: LogLevel;
  event: string;
  timestamp: string;
  fields: LogFields;
}

/** 로그 목적지 — 기본은 콘솔. 운영에서 Sentry 등으로 교체 가능. */
export type LogSink = (record: LogRecord) => void;

const consoleSink: LogSink = (r) => {
  const payload = { event: r.event, ...r.fields };
  const line = `[${r.level}] ${r.event}`;
  if (r.level === 'error') console.error(line, payload);
  else if (r.level === 'warn') console.warn(line, payload);
  else if (r.level === 'info') console.info(line, payload);
  else console.log(line, payload);
};

let sink: LogSink = consoleSink;

/**
 * 최근 로그를 메모리에 조금 남긴다 — **진단 로그 내려받기가 읽을 것**.
 *
 * 예전에는 설정 → 시스템 로그가 지어낸 네 줄("세션 복구 성공", "동기화 완료",
 * "success=100%")을 현재 시각과 함께 찍어 줬다. 그 기능을 누르는 순간은 대개
 * 무언가 잘못됐을 때인데, 파일은 늘 "전부 정상"이라고 말한다. 그걸 받아 본
 * 사람은 앱이 멀쩡하다고 결론 내리고 진짜 원인은 그대로 남는다 — 진단 도구가
 * 거짓을 말하는 것은 진단 도구가 없는 것보다 나쁘다.
 *
 * 담기는 것은 이미 마스킹을 거친 기록이다(redact 이후). 상한을 두어 오래 켜 둔
 * 앱이 메모리를 갉아먹지 않게 하고, 넘치면 오래된 것부터 버린다.
 */
const RECENT_LIMIT = 200;
let recent: LogRecord[] = [];

/** 최근 로그(오래된 것 → 최신). 내려받기·개발자 화면이 읽는다. */
export function recentLogs(): LogRecord[] {
  return [...recent];
}

/** 테스트·초기화용. */
export function clearRecentLogs(): void {
  recent = [];
}

/** 로그 목적지 교체(운영 수집기 연결용). */
export function setLogSink(next: LogSink): void {
  sink = next;
}

/** 테스트/초기화용 — 기본(콘솔) 목적지로 되돌린다. */
export function resetLogSink(): void {
  sink = consoleSink;
}

function emit(level: LogLevel, event: string, fields: LogFields = {}): void {
  // debug 는 개발 중에만 — 운영 로그 소음을 줄인다.
  if (level === 'debug' && !__DEV__) return;
  const record: LogRecord = {
    level,
    event,
    timestamp: new Date().toISOString(),
    fields: redact(fields),
  };
  recent.push(record);
  if (recent.length > RECENT_LIMIT) recent = recent.slice(-RECENT_LIMIT);
  sink(record);
}

export const logger = {
  debug: (event: string, fields?: LogFields) => emit('debug', event, fields),
  info: (event: string, fields?: LogFields) => emit('info', event, fields),
  warn: (event: string, fields?: LogFields) => emit('warn', event, fields),
  error: (event: string, fields?: LogFields) => emit('error', event, fields),
};
