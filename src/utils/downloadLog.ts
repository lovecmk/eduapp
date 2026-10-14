import { Platform, Share } from 'react-native';
import { env } from '../data/network/env';
import { APP_NAME } from '../constants/brand';
import { recentLogs, type LogRecord } from './logger';

/** 로그 한 줄 — 시각·수준·이벤트·필드. */
function formatRecord(r: LogRecord): string {
  const level = r.level.toUpperCase().padEnd(5);
  const fields = Object.keys(r.fields).length > 0 ? ` ${JSON.stringify(r.fields)}` : '';
  return `[${r.timestamp}] ${level} ${r.event}${fields}`;
}

/**
 * 진단용 시스템 로그를 생성해 내려받는다(운영 마감 기능).
 * 웹에서는 Blob 다운로드, 네이티브에서는 공유 시트로 폴백한다.
 *
 * ── 지어내지 않는다 ──────────────────────────────────────────────────────
 * 예전에는 '최근 이벤트' 자리에 네 줄이 **박혀** 있었다 — "세션 복구 성공",
 * "학습 카드 동기화 완료", "success=100%". 무슨 일이 있었든 늘 같은 네 줄이,
 * 그것도 현재 시각을 달고 나갔다. 이 기능을 누르는 순간은 대개 무언가 잘못됐을
 * 때인데 파일은 항상 "전부 정상"이라고 말한다. 그걸 받아 본 사람은 앱이
 * 멀쩡하다고 결론 내리고, 진짜 원인은 그대로 남는다.
 *
 * 지금은 실제 기록(logger 의 최근 로그)을 싣는다. 남은 것이 없으면 없다고 적는다 —
 * 빈 목록은 '아무 일도 없었다'는 정보이지, 지어낼 이유가 아니다.
 * 민감정보는 logger 가 이미 마스킹한 뒤라 그대로 실어도 안전하다.
 */
export async function downloadSystemLog(): Promise<void> {
  const now = new Date();
  const records = recentLogs();
  const log = [
    `=== ${APP_NAME} 시스템 로그 ===`,
    `생성 시각: ${now.toISOString()}`,
    `앱 버전: v${env.build.version} (build ${env.build.buildNumber})`,
    `커밋: ${env.build.commit}`,
    `플랫폼: ${Platform.OS}`,
    `데이터 소스: ${'LIVE'}`,
    `API: ${env.apiBaseUrl || '(미설정)'}`,
    '',
    `--- 최근 이벤트 (${records.length}건) ---`,
    ...(records.length > 0
      ? records.map(formatRecord)
      : ['(이번 실행에서 기록된 이벤트가 없습니다)']),
    '=== EOF ===',
    '',
  ].join('\n');

  const filename = `field-learning-log-${now.getTime()}.txt`;

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const blob = new Blob([log], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return;
  }

  await Share.share({ message: log, title: filename });
}
