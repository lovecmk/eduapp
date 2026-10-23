const fs = require('node:fs');
const path = require('node:path');

/** Keep Firebase client configuration outside source control and the JS bundle. */
module.exports = function withFirebaseConfig(config, { root = path.resolve(__dirname, '..'), file = process.env.GOOGLE_SERVICES_JSON } = {}) {
  const configured = file || config.android?.googleServicesFile;
  const candidate = path.resolve(root, configured || 'google-services.json');
  if (!fs.existsSync(candidate)) {
    if (configured) throw new Error('Android Firebase 설정 파일을 찾을 수 없습니다. GOOGLE_SERVICES_JSON 경로를 확인하세요.');
    console.warn('[app.config] Android FCM 미설정: 원격 푸시에는 com.raywon.newapp용 google-services.json이 필요합니다.');
    return config;
  }
  let firebase;
  try { firebase = JSON.parse(fs.readFileSync(candidate, 'utf8')); }
  catch { throw new Error('Android Firebase 설정 파일을 읽을 수 없습니다.'); }
  if (!Array.isArray(firebase.client) || !firebase.client.some(client => client?.client_info?.android_client_info?.package_name === config.android?.package)) {
    throw new Error('Android Firebase 설정의 패키지가 앱 패키지와 다릅니다.');
  }
  return { ...config, android: { ...config.android, googleServicesFile: candidate } };
};
