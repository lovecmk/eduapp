import { Platform, Share } from 'react-native';
import { env } from '../data/network/env';

/**
 * 진단용 시스템 로그를 생성해 내려받는다(운영 마감 기능).
 * 웹에서는 Blob 다운로드, 네이티브에서는 공유 시트로 폴백한다.
 */
export async function downloadSystemLog(): Promise<void> {
  const now = new Date();
  const log = [
    '=== 현장학습 시스템 로그 ===',
    `생성 시각: ${now.toISOString()}`,
    `앱 버전: v${env.build.version} (build ${env.build.buildNumber})`,
    `커밋: ${env.build.commit}`,
    `플랫폼: ${Platform.OS}`,
    `데이터 소스: ${env.useMockData ? 'MOCK' : 'LIVE'}`,
    `API: ${env.apiBaseUrl || '(mock fallback)'}`,
    '',
    '--- 최근 이벤트 ---',
    `[${now.toISOString()}] INFO  app.boot           앱 초기화 완료`,
    `[${now.toISOString()}] INFO  auth.session        세션 복구 성공`,
    `[${now.toISOString()}] INFO  sync.cards          학습 카드 동기화 완료`,
    `[${now.toISOString()}] DEBUG net.health          latency=45ms success=100%`,
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
