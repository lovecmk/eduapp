const withInsecureApiHost = require('./plugins/withInsecureApiHost');
const withFirebaseConfig = require('./plugins/withFirebaseConfig');

/**
 * 동적 앱 설정 — app.json 을 그대로 받아 **API 주소에 따라 달라지는 부분만** 얹는다.
 *
 * app.json 을 없애지 않은 이유가 있다. 배포 파이프라인(scripts/bump-version.mjs,
 * build-apk.yml 의 `require('./app.json')`)이 그 파일에서 버전을 읽고 쓴다.
 * 여기서는 그 값을 건드리지 않고 받은 config 위에 얹기만 한다.
 *
 * Expo CLI 는 이 파일을 평가하기 전에 `.env` 를 읽어 process.env 에 넣는다.
 * 그래서 `EXPO_PUBLIC_API_BASE_URL` 하나로 아래 세 가지가 함께 정해진다.
 *   · 앱이 붙을 서버 (번들에 인라인)
 *   · 평문 서버일 때의 네이티브 예외 (withInsecureApiHost)
 *   · 빌드 로그에 남는 확인 문구
 */
module.exports = ({ config }) => {
  const raw = (process.env.EXPO_PUBLIC_API_BASE_URL || '').trim();

  let host = '';
  let insecure = false;
  if (raw) {
    try {
      const url = new URL(raw);
      host = url.hostname;
      insecure = url.protocol === 'http:';
    } catch {
      console.warn(`[app.config] EXPO_PUBLIC_API_BASE_URL 을 URL 로 읽지 못했습니다: "${raw}"`);
    }
  }

  // 빌드 산출물만 보고는 어느 서버를 보는 빌드인지 알 수 없다. 로그에 한 줄 남긴다 —
  // "테스트 주소로 스토어에 올렸다"를 사후가 아니라 빌드 로그에서 발견하기 위해.
  console.log(
    `[app.config] API=${raw || '(미설정 · 목업 폴백)'}${insecure ? ' · 평문(http) → cleartext/ATS 예외 적용' : ''}`,
  );

  const next = withFirebaseConfig({ ...config });
  const buildNumber = Number(process.env.EXPO_PUBLIC_BUILD_NUMBER);
  if (Number.isSafeInteger(buildNumber) && buildNumber > 0 && buildNumber <= 2100000000) {
    next.android = { ...next.android, versionCode: buildNumber };
    next.ios = { ...config.ios, buildNumber: String(buildNumber) };
  }
  return insecure ? withInsecureApiHost(next, { host }) : next;
};
