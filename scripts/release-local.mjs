#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, npm, git, assertClean, assertRemoteTag, github, collect, preparedAssets, publish } from './lib/local-release.mjs';
import { androidBuildEnvironment } from './lib/android-build-env.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function releaseVersion() {
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));
  const publicManifest = JSON.parse(fs.readFileSync(path.join(root, 'public/version.json'), 'utf8'));
  if (app.version !== manifest.version || JSON.stringify(manifest) !== JSON.stringify(publicManifest) || !Number.isSafeInteger(manifest.buildNumber) || manifest.buildNumber < 1) throw new Error('앱 버전 파일 3개가 일치하지 않습니다.');
  return manifest;
}

export async function buildLocal() {
  assertClean(root);
  const { version, buildNumber, buildTime } = releaseVersion();
  const commit = git(root, 'rev-parse', 'HEAD');
  const short = git(root, 'rev-parse', '--short', 'HEAD');
  const localConfigPath = path.join(root, '.release-config.local');
  const localConfig = fs.existsSync(localConfigPath) ? JSON.parse(fs.readFileSync(localConfigPath, 'utf8')) : {};
  const baseline = process.env.LOCAL_RELEASE_ANDROID_CERT_SHA256 || localConfig.androidCertificateSha256;
  if (!/^[a-f0-9]{64}$/i.test(baseline?.replace(/:/g, '') ?? '')) throw new Error('기존 APK 인증서 SHA-256을 .release-config.local에 설정하세요.');
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || (process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android/Sdk'));
  if (!sdk || !fs.existsSync(path.join(sdk, 'platforms/android-35/android.jar'))) throw new Error('Android SDK 35가 필요합니다. ANDROID_HOME을 설정하세요.');
  if (process.platform === 'win32') {
    const ninja = path.join(sdk, 'cmake/3.22.1/bin/ninja.exe');
    const version = run(root, ninja, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }).trim();
    const [major, minor] = version.split('.').map(Number);
    if (!(major > 1 || major === 1 && minor >= 12)) throw new Error('Windows 긴 경로를 지원하는 Ninja 1.12 이상이 필요합니다 (SDK CMake 3.22.1/bin).');
  }
  const { env, jvmArg, wrapperJvmArgs } = androidBuildEnvironment({
    ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1', EXPO_NO_DOTENV: '1',
    ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk,
    EXPO_PUBLIC_API_BASE_URL: 'https://bridge.kfpa.or.kr', EXPO_PUBLIC_API_TIMEOUT_MS: '10000',
    EXPO_PUBLIC_BUILD_NUMBER: String(buildNumber), EXPO_PUBLIC_APP_VERSION: version,
    EXPO_PUBLIC_COMMIT_SHA: commit, EXPO_PUBLIC_BUILD_TIME: buildTime,
  }, localConfig);
  npm(root, ['run', 'typecheck'], env);
  npm(root, ['test', '--', '--runInBand'], env);
  npm(root, ['run', 'test:release'], env);
  const expo = path.join(root, 'node_modules/expo/bin/cli');
  run(root, process.execPath, [expo, 'prebuild', '--platform', 'android', '--no-install'], { env });
  // Use the generated wrapper, never a machine-wide Gradle installation.
  const android = path.join(root, 'android');
  // Environment-only build metadata is not a Gradle source input. Regenerate the
  // JS bundle for each release so a cached bundle cannot retain an older SHA.
  fs.rmSync(path.join(android, 'app/build/generated/assets/createBundleReleaseJsAndAssets/index.android.bundle'), { force: true });
  const java = env.JAVA_HOME ? path.join(env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java';
  // Invoke the same wrapper entry point directly to preserve JVM arguments on Windows.
  run(android, java, [...wrapperJvmArgs, '-classpath', path.join(android, 'gradle/wrapper/gradle-wrapper.jar'), 'org.gradle.wrapper.GradleWrapperMain',
    'assembleRelease', '--no-daemon', '--stacktrace', '--max-workers=2', jvmArg], { env });
  const apk = path.join(android, 'app/build/outputs/apk/release/app-release.apk');
  const tools = path.join(sdk, 'build-tools/35.0.0');
  const aapt = path.join(tools, process.platform === 'win32' ? 'aapt.exe' : 'aapt');
  const details = run(root, aapt, ['dump', 'badging', apk], { env, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  if (!details.includes("name='com.raywon.newapp'") || !details.includes(`versionCode='${buildNumber}'`) || !details.includes(`versionName='${version}'`)) throw new Error('APK 패키지/버전/빌드 번호가 다릅니다.');
  const signature = run(root, java, ['-jar', path.join(tools, 'lib/apksigner.jar'), 'verify', '--print-certs', apk], { env, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  const certificate = /certificate SHA-256 digest: ([a-f0-9]+)/i.exec(signature)?.[1]?.toLowerCase();
  if (!certificate) throw new Error('APK 서명을 확인하지 못했습니다.');
  if (!baseline || certificate !== baseline.replace(/:/g, '').toLowerCase()) throw new Error('기존 배포 APK와 서명을 비교해야 합니다. LOCAL_RELEASE_ANDROID_CERT_SHA256을 기존 APK의 SHA-256 인증서 값으로 설정하세요.');
  const files = collect(root, version, commit, [{ source: apk, name: `eduapp-v${version}-${short}.apk`, signature: Buffer.from('PK') }], {
    target: 'android', api: env.EXPO_PUBLIC_API_BASE_URL, buildNumber,
    signing: 'existing-debug-certificate', certificateSha256: certificate,
  });
  assertClean(root);
  return { version, commit, tag: `v${version}-${short}`, files };
}

export async function publishLocal(prepared, api = github(root)) {
  assertClean(root);
  assertRemoteTag(root, prepared.tag, prepared.commit);
  return publish({ api, ...prepared, name: `현장학습 v${prepared.version} (${prepared.commit.slice(0, 7)})`, prerelease: true,
    body: `Android 테스트 APK · PC 로컬 빌드 (기존 디버그 서명 유지)\n\n- 운영 서버: https://bridge.kfpa.or.kr\n- APK를 내려받아 설치하세요.\n- SHA256SUMS.txt: 파일 체크섬\n- BUILD-INFO.json: 버전·빌드 번호·커밋·인증서 정보\n\n커밋 ${prepared.commit}` });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const { version } = releaseVersion();
    const commit = git(root, 'rev-parse', 'HEAD');
    const expectedTag = `v${version}-${git(root, 'rev-parse', '--short', 'HEAD')}`;
    const tag = args.find(arg => !arg.startsWith('--')) ?? expectedTag;
    if (tag !== expectedTag || args.some(arg => arg.startsWith('--') && !['--dry-run', '--prepare-only', '--publish-only'].includes(arg)) || args.filter(arg => !arg.startsWith('--')).length > 1 || args.filter(arg => arg.startsWith('--')).length > 1) throw new Error('사용: npm run release:local -- [현재 vX.Y.Z-SHA] [--dry-run|--prepare-only|--publish-only]');
    assertClean(root);
    assertRemoteTag(root, tag, commit);
    const api = github(root);
    if (!await api('GET', '')) throw new Error('GitHub 저장소 접근 권한이 없습니다.');
    if (args.includes('--dry-run')) console.log(`${tag}: 로컬 빌드·업로드 사전 검사 통과 (빌드/게시 없음)`);
    else {
      const prepared = args.includes('--publish-only') ? { version, commit, tag, files: preparedAssets(root, version, commit) } : await buildLocal();
      if (args.includes('--prepare-only')) console.log(`빌드 완료: dist-release/${version}`);
      else await publishLocal(prepared, api);
    }
  } catch (error) { console.error(`로컬 릴리스 중단: ${error.message}`); process.exitCode = 1; }
}
