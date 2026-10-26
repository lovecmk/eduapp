#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import https from 'node:https';
import { rootCertificates } from 'node:tls';
import { run, git, assertClean, assertRemoteTag, github, preparedAssets, verifyAsset } from './lib/local-release.mjs';
import { readReleaseVersion, releaseEnvironment, nodeTrustEnvironment } from './lib/release-env.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// This records native compatibility independently of the marketing/build version.
export function nativeRuntimeHash(projectRoot) {
  const app = JSON.parse(fs.readFileSync(path.join(projectRoot, 'app.json'), 'utf8')).expo;
  delete app.version;
  if (app.android) delete app.android.versionCode;
  if (app.ios) delete app.ios.buildNumber;
  const dependencies = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')).dependencies;
  const pluginFiles = directory => fs.readdirSync(path.join(projectRoot, directory), { withFileTypes: true }).flatMap(entry => {
    if (entry.name === '__tests__') return [];
    const file = `${directory}/${entry.name}`;
    return entry.isDirectory() ? pluginFiles(file) : [file];
  });
  const files = ['app.config.js', 'package-lock.json', ...pluginFiles('plugins').sort()];
  const inputs = [JSON.stringify(app), JSON.stringify(dependencies), ...files.map(file => `${file}\n${fs.readFileSync(path.join(projectRoot, file), 'utf8').replace(/\r\n/g, '\n')}`)];
  return createHash('sha256').update(inputs.join('\n')).digest('hex');
}

export function validateOtaConfig(app, baseline, nativeHash) {
  const projectId = app.extra?.eas?.projectId;
  if (!/^[\da-f-]{36}$/i.test(projectId ?? '') || app.updates?.url !== `https://u.expo.dev/${projectId}` || app.updates.enabled !== true || app.updates.requestHeaders?.['expo-channel-name'] !== 'production') throw new Error('OTA 프로젝트 URL/production 채널 설정이 다릅니다.');
  if (typeof app.runtimeVersion !== 'string' || baseline.runtimeVersion !== app.runtimeVersion || baseline.nativeHash !== nativeHash) throw new Error('네이티브 구성이 OTA 기준과 다릅니다. 네이티브 변경은 runtimeVersion을 올리고 새 APK를 배포한 뒤 OTA 기준을 갱신하세요.');
  return { projectId, runtimeVersion: app.runtimeVersion, channel: 'production', branch: 'production' };
}

export function validateOtaChannel(data) {
  const channel = data.currentPage;
  const mapping = JSON.parse(channel?.branchMapping ?? 'null');
  const branches = channel?.updateBranches ?? [];
  if (channel?.name !== 'production' || channel.isPaused || mapping?.data?.length !== 1 || mapping.data[0].branchMappingLogic !== 'true' || !branches.some(branch => branch.name === 'production' && branch.id === mapping.data[0].branchId)) throw new Error('production 채널이 production 브랜치에 단독 연결되어 있지 않거나 일시 중지 상태입니다. 채널을 확인하세요.');
}

export function validateOtaUpdates(updates, { commit, runtimeVersion, message }) {
  if (!Array.isArray(updates) || updates.length !== 1) throw new Error('Android OTA 게시 결과가 한 건이어야 합니다.');
  const update = updates[0];
  if (update.platform !== 'android' || update.branch !== 'production' || update.runtimeVersion !== runtimeVersion || update.gitCommitHash !== commit || update.message !== message || update.isRollBackToEmbedded || !/^[\da-f-]{36}$/i.test(update.group ?? '')) throw new Error('OTA 커밋/런타임/채널/릴리스 정보가 다릅니다.');
  return update;
}

export function parseEasJson(output) {
  // Expo config plugins may log a line before the CLI's JSON result.
  for (const offset of [0, ...Array.from(output.matchAll(/\n(?=[\[{])/g), match => match.index + 1)]) {
    try { return JSON.parse(output.slice(offset)); } catch { /* try the next JSON block */ }
  }
  throw new Error('EAS JSON 결과를 읽지 못했습니다.');
}

function eas(projectRoot, args, env, json = true, interactive = false) {
  const candidates = [env.LOCAL_RELEASE_EAS_CLI, path.join(projectRoot, 'node_modules/eas-cli/bin/run'), path.join(path.dirname(process.execPath), 'node_modules/eas-cli/bin/run'), env.APPDATA && path.join(env.APPDATA, 'npm/node_modules/eas-cli/bin/run')].filter(Boolean);
  const cli = candidates.find(file => fs.existsSync(file));
  if (!cli) throw new Error('EAS CLI가 필요합니다. npm install -g eas-cli 후 eas.cmd login --browser를 실행하세요.');
  const cliEnv = { ...env, EAS_NO_UPDATE_CHECK: '1' };
  delete cliEnv.EAS_NO_VCS;
  let output;
  try {
    output = run(projectRoot, process.execPath, [cli, ...args], { env: cliEnv, stdio: interactive ? 'inherit' : ['ignore', 'pipe', 'inherit'], encoding: 'utf8', timeout: 600_000, maxBuffer: 20 * 1024 * 1024 });
  } catch { throw new Error('EAS 실행에 실패했습니다. Expo 로그인/권한/사용량을 확인하세요. 로그인: eas.cmd login --browser'); }
  return json ? parseEasJson(output) : output;
}

export function preflightOta({ projectRoot = root, checkAccount = true } = {}) {
  const app = JSON.parse(fs.readFileSync(path.join(projectRoot, 'app.json'), 'utf8')).expo;
  const baseline = JSON.parse(fs.readFileSync(path.join(projectRoot, 'scripts/ota-runtime.json'), 'utf8'));
  const config = validateOtaConfig(app, baseline, nativeRuntimeHash(projectRoot));
  const version = readReleaseVersion(projectRoot);
  const commit = git(projectRoot, 'rev-parse', 'HEAD');
  const env = releaseEnvironment(version, commit, nodeTrustEnvironment(projectRoot));
  if (checkAccount) {
    eas(projectRoot, ['project:info'], env, false);
    validateOtaChannel(eas(projectRoot, ['channel:view', 'production', '--json', '--non-interactive', '--limit', '1'], env));
  }
  return { ...config, ...version, commit, env };
}

export function verifyOtaBundle(directory, { commit, env }) {
  const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'metadata.json'), 'utf8'));
  const bundleName = metadata.fileMetadata?.android?.bundle;
  const bundlePath = path.resolve(directory, bundleName ?? '');
  if (!bundleName || !bundlePath.startsWith(path.resolve(directory) + path.sep) || metadata.fileMetadata.ios) throw new Error('Android 전용 OTA 번들 메타데이터가 올바르지 않습니다.');
  const bundle = fs.readFileSync(bundlePath);
  if (![commit, env.EXPO_PUBLIC_API_BASE_URL, env.EXPO_PUBLIC_APP_VERSION].every(value => bundle.includes(Buffer.from(value)))) throw new Error('OTA 번들의 현재 커밋/운영 API/버전 정보를 확인하지 못했습니다.');
}

export function parseOtaManifest(body, contentType) {
  if (/application\/(?:expo\+)?json/.test(contentType)) return JSON.parse(body);
  const boundary = /boundary="?([^";]+)/i.exec(contentType)?.[1];
  if (!boundary) throw new Error('OTA 응답의 multipart 경계가 없습니다.');
  const part = body.split(`--${boundary}`).find(value => /name="manifest"/.test(value));
  if (!part) throw new Error('production 서버 응답에 OTA manifest가 없습니다.');
  return JSON.parse(part.slice(part.indexOf('\r\n\r\n') + 4).trim());
}

export async function verifyServedOta(context, update) {
  const ca = context.env.NODE_EXTRA_CA_CERTS ? [...rootCertificates, fs.readFileSync(context.env.NODE_EXTRA_CA_CERTS)] : undefined;
  const response = await new Promise((resolve, reject) => {
    const request = https.get(`https://u.expo.dev/${context.projectId}`, {
      ca, headers: { 'expo-platform': 'android', 'expo-runtime-version': context.runtimeVersion, 'expo-channel-name': 'production', 'expo-protocol-version': '1', Accept: 'multipart/mixed' },
    }, result => {
      const chunks = [];
      let size = 0;
      result.on('data', chunk => {
        size += chunk.length;
        if (size > 10_000_000) result.destroy(new Error('OTA 응답이 너무 큽니다.'));
        else chunks.push(chunk);
      });
      result.on('error', reject);
      result.on('end', () => resolve({ status: result.statusCode, type: result.headers['content-type'] ?? '', body: Buffer.concat(chunks).toString('utf8') }));
    });
    request.setTimeout(30_000, () => request.destroy(new Error('OTA 서버 검증 시간이 초과됐습니다.')));
    request.on('error', reject);
  });
  if (response.status !== 200) throw new Error(`OTA 서버 확인 실패 (${response.status}).`);
  const manifest = parseOtaManifest(response.body, response.type);
  if (manifest.id !== update.id || manifest.runtimeVersion !== context.runtimeVersion) throw new Error('실제 앱에 제공되는 OTA와 게시 결과가 다릅니다.');
  return manifest.id;
}

export async function publishOta({ projectRoot = root, tag, api = github(projectRoot) } = {}) {
  assertClean(projectRoot);
  const context = preflightOta({ projectRoot });
  const expectedTag = `v${context.version}-${git(projectRoot, 'rev-parse', '--short', 'HEAD')}`;
  tag ??= expectedTag;
  if (tag !== expectedTag) throw new Error('현재 버전/커밋의 릴리스 태그만 OTA로 게시할 수 있습니다.');
  assertRemoteTag(projectRoot, tag, context.commit);
  const remoteMain = git(projectRoot, 'ls-remote', 'origin', 'refs/heads/main').split('\t')[0];
  if (remoteMain !== context.commit) throw new Error('최신 원격 main의 릴리스만 OTA로 게시할 수 있습니다.');
  const release = await api('GET', `releases/tags/${tag}`);
  if (!release || release.draft) throw new Error('검증된 APK GitHub Release를 먼저 공개하세요.');
  // Reuse the APK provenance/checksums; OTA must come from the identical source.
  const files = preparedAssets(projectRoot, context.version, context.commit);
  const assets = await api('GET', `releases/${release.id}/assets?per_page=100`);
  for (const file of files) {
    const asset = assets.find(item => item.name === path.basename(file));
    if (!asset) throw new Error('GitHub Release의 APK/체크섬/출처 파일이 빠져 있습니다.');
    verifyAsset(asset, file);
  }
  const message = `PC release ${tag}`;
  const list = eas(projectRoot, ['update:list', '--branch', 'production', '--platform', 'android', '--runtime-version', context.runtimeVersion, '--limit', '1', '--json', '--non-interactive'], context.env);
  const latest = list.currentPage?.[0];
  let updates;
  if (latest?.message?.endsWith(message)) {
    updates = eas(projectRoot, ['update:view', latest.group, '--json'], context.env);
  } else {
    const directory = path.join(projectRoot, 'dist-release', context.version, 'ota');
    // Export and inspect before anything is uploaded. Do not load a local .env.
    const expo = path.join(projectRoot, 'node_modules/expo/bin/cli');
    run(projectRoot, process.execPath, [expo, 'export', '--platform', 'android', '--output-dir', directory, '--clear', '--max-workers', '2'], { env: context.env });
    verifyOtaBundle(directory, context);
    assertClean(projectRoot);
    updates = eas(projectRoot, ['update', '--branch', 'production', '--platform', 'android', '--message', message, '--input-dir', directory, '--skip-bundler', '--json', '--non-interactive'], context.env);
  }
  const published = validateOtaUpdates(updates, { ...context, message });
  const verified = validateOtaUpdates(eas(projectRoot, ['update:view', published.group, '--json'], context.env), { ...context, message });
  validateOtaChannel(eas(projectRoot, ['channel:view', 'production', '--json', '--non-interactive', '--limit', '1'], context.env));
  const servedUpdateId = await verifyServedOta(context, verified);
  const receipt = { tag, commit: context.commit, runtimeVersion: context.runtimeVersion, projectId: context.projectId, channel: 'production', ...verified, servedUpdateId, verifiedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(projectRoot, 'dist-release', context.version, 'OTA-INFO.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(`OTA 게시 검증 완료: https://expo.dev/accounts/${JSON.parse(fs.readFileSync(path.join(projectRoot, 'app.json'), 'utf8')).expo.owner}/projects/new-app/updates/${verified.group}`);
  return receipt;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--login') {
      eas(root, ['login', '--browser'], nodeTrustEnvironment(root), false, true);
    } else {
      if (args.filter(arg => !arg.startsWith('--')).length > 1 || args.some(arg => arg.startsWith('--') && arg !== '--dry-run')) throw new Error('사용: npm run release:ota -- [현재 vX.Y.Z-SHA] [--dry-run]');
      assertClean(root);
      if (args.includes('--dry-run')) {
        const config = preflightOta();
        console.log(`OTA 사전 검사 통과: ${config.version}, Android, production, runtime ${config.runtimeVersion} (게시 없음)`);
      } else await publishOta({ tag: args.find(arg => !arg.startsWith('--')) });
    }
  } catch (error) { console.error(`OTA 배포 중단: ${error.message}`); process.exitCode = 1; }
}
