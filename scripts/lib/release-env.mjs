import fs from 'node:fs';
import path from 'node:path';

export function nodeTrustEnvironment(root, base = process.env) {
  const configFile = path.join(root, '.release-config.local');
  const config = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf8')) : {};
  if (base.NODE_EXTRA_CA_CERTS || !config.nodeExtraCaCerts) return { ...base };
  const certificates = path.resolve(root, config.nodeExtraCaCerts);
  if (!fs.existsSync(certificates)) throw new Error('로컬 Node CA 인증서 파일을 찾지 못했습니다.');
  return { ...base, NODE_EXTRA_CA_CERTS: certificates };
}

export function readReleaseVersion(root) {
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));
  const publicManifest = JSON.parse(fs.readFileSync(path.join(root, 'public/version.json'), 'utf8'));
  if (app.version !== manifest.version || JSON.stringify(manifest) !== JSON.stringify(publicManifest) || !Number.isSafeInteger(manifest.buildNumber) || manifest.buildNumber < 1) throw new Error('앱 버전 파일 3개가 일치하지 않습니다.');
  return manifest;
}

export function releaseEnvironment(manifest, commit, base = process.env) {
  return {
    ...base, CI: '1', EXPO_NO_TELEMETRY: '1', EXPO_NO_DOTENV: '1',
    EXPO_PUBLIC_API_BASE_URL: 'https://bridge.kfpa.or.kr', EXPO_PUBLIC_API_TIMEOUT_MS: '10000',
    EXPO_PUBLIC_USE_MOCK_DATA: 'false',
    EXPO_PUBLIC_BUILD_NUMBER: String(manifest.buildNumber), EXPO_PUBLIC_APP_VERSION: manifest.version,
    EXPO_PUBLIC_COMMIT_SHA: commit, EXPO_PUBLIC_BUILD_TIME: manifest.buildTime,
  };
}
