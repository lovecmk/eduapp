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

function redact(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    const lower = k.toLowerCase();
    out[k] = SENSITIVE_KEYS.some((s) => lower.includes(s)) ? '***' : v;
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
  sink({ level, event, timestamp: new Date().toISOString(), fields: redact(fields) });
}

export const logger = {
  debug: (event: string, fields?: LogFields) => emit('debug', event, fields),
  info: (event: string, fields?: LogFields) => emit('info', event, fields),
  warn: (event: string, fields?: LogFields) => emit('warn', event, fields),
  error: (event: string, fields?: LogFields) => emit('error', event, fields),
};
