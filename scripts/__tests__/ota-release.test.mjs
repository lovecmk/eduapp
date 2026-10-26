import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { nativeRuntimeHash, validateOtaConfig, validateOtaChannel, validateOtaUpdates, verifyOtaBundle, parseEasJson, parseOtaManifest } from '../release-ota.mjs';
import { releaseEnvironment, nodeTrustEnvironment } from '../lib/release-env.mjs';

const projectId = 'e19dea99-7f73-41b8-83d6-d6b0b99fbe91';
const app = { version: '1.2.3', runtimeVersion: '1.11.0', extra: { eas: { projectId } }, updates: { enabled: true, url: `https://u.expo.dev/${projectId}`, requestHeaders: { 'expo-channel-name': 'production' } } };
const channel = { currentPage: { name: 'production', branchMapping: JSON.stringify({ version: 0, data: [{ branchId: 'branch', branchMappingLogic: 'true' }] }), updateBranches: [{ id: 'branch', name: 'production' }] } };
const update = { id: projectId, group: projectId, platform: 'android', branch: 'production', runtimeVersion: '1.11.0', gitCommitHash: 'a'.repeat(40), message: 'PC release v1.2.3-aaaaaaa' };

test('APK and OTA use the same live API and exact source metadata despite local overrides', () => {
  const base = { EXPO_PUBLIC_API_BASE_URL: 'http://test.invalid', EXPO_PUBLIC_BUILD_NUMBER: '1', EXPO_PUBLIC_USE_MOCK_DATA: 'true' };
  const manifest = { version: '1.2.3', buildNumber: 9, buildTime: '2026-10-26T00:00:00.000Z' };
  const env = releaseEnvironment(manifest, update.gitCommitHash, base);
  assert.equal(env.EXPO_PUBLIC_API_BASE_URL, 'https://bridge.kfpa.or.kr');
  assert.equal(env.EXPO_PUBLIC_COMMIT_SHA, update.gitCommitHash);
  assert.equal(env.EXPO_PUBLIC_APP_VERSION, '1.2.3');
  assert.equal(env.EXPO_PUBLIC_BUILD_NUMBER, '9');
  assert.equal(env.EXPO_NO_DOTENV, '1');
  assert.equal(env.EXPO_PUBLIC_USE_MOCK_DATA, 'false');
  assert.equal(base.EXPO_PUBLIC_API_BASE_URL, 'http://test.invalid');
});

test('OTA rejects mismatched native runtime, project URL or channel', () => {
  const baseline = { runtimeVersion: app.runtimeVersion, nativeHash: 'native' };
  assert.equal(validateOtaConfig(app, baseline, 'native').channel, 'production');
  assert.throws(() => validateOtaConfig(app, baseline, 'changed'), /네이티브/);
  assert.throws(() => validateOtaConfig({ ...app, runtimeVersion: 'new' }, baseline, 'native'), /네이티브/);
  assert.throws(() => validateOtaConfig({ ...app, updates: { ...app.updates, url: 'https://other.invalid' } }, baseline, 'native'), /프로젝트/);
  assert.throws(() => validateOtaConfig({ ...app, updates: { ...app.updates, requestHeaders: { 'expo-channel-name': 'preview' } } }, baseline, 'native'), /채널/);
});

test('OTA channel rejects paused, split or incorrectly mapped production traffic', () => {
  assert.doesNotThrow(() => validateOtaChannel(channel));
  assert.throws(() => validateOtaChannel({ currentPage: { ...channel.currentPage, isPaused: true } }), /채널/);
  assert.throws(() => validateOtaChannel({ currentPage: { ...channel.currentPage, updateBranches: [{ id: 'other', name: 'production' }] } }), /채널/);
  assert.throws(() => validateOtaChannel({ currentPage: { ...channel.currentPage, branchMapping: JSON.stringify({ data: [{ branchId: 'branch', branchMappingLogic: 'true' }, { branchId: 'other', branchMappingLogic: 'true' }] }) } }), /채널/);
});

test('published OTA must match the Android release source and runtime', () => {
  const expected = { commit: update.gitCommitHash, runtimeVersion: update.runtimeVersion, message: update.message };
  assert.equal(validateOtaUpdates([update], expected), update);
  for (const patch of [{ platform: 'ios' }, { gitCommitHash: 'b'.repeat(40) }, { runtimeVersion: 'new' }, { branch: 'preview' }, { message: 'other release' }, { isRollBackToEmbedded: true }]) {
    assert.throws(() => validateOtaUpdates([{ ...update, ...patch }], expected), /OTA/);
  }
  assert.throws(() => validateOtaUpdates([update, update], expected), /한 건/);
});

test('native fingerprint permits version/script changes but detects config/dependency/plugin changes', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ota-native-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'plugins'));
  const write = (name, value) => fs.writeFileSync(path.join(root, name), typeof value === 'string' ? value : JSON.stringify(value));
  write('app.json', { expo: app });
  write('package.json', { dependencies: { expo: '~52.0.47' } });
  write('package-lock.json', '{}');
  write('app.config.js', 'config');
  write('plugins/native.js', 'plugin');
  fs.mkdirSync(path.join(root, 'plugins', 'native'));
  write('plugins/native/Alarm.kt', 'native source');
  const hash = nativeRuntimeHash(root);
  write('app.json', { expo: { ...app, version: '1.2.4', android: undefined } });
  write('package.json', { dependencies: { expo: '~52.0.47' }, scripts: { release: 'changed' } });
  assert.equal(nativeRuntimeHash(root), hash);
  write('plugins/native/Alarm.kt', 'changed native source');
  assert.notEqual(nativeRuntimeHash(root), hash);
  write('plugins/native/Alarm.kt', 'native source');
  write('plugins/native.js', 'different');
  assert.notEqual(nativeRuntimeHash(root), hash);
  write('plugins/native.js', 'plugin');
  write('package.json', { dependencies: { expo: '~53.0.0' } });
  assert.notEqual(nativeRuntimeHash(root), hash);
});

test('OTA bundle is rejected before upload if source/API metadata is missing or path escapes', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ota-bundle-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const context = { commit: update.gitCommitHash, env: { EXPO_PUBLIC_API_BASE_URL: 'https://bridge.kfpa.or.kr', EXPO_PUBLIC_APP_VERSION: '1.2.3' } };
  const metadata = { fileMetadata: { android: { bundle: 'index.hbc' } } };
  const writeMetadata = value => fs.writeFileSync(path.join(directory, 'metadata.json'), JSON.stringify(value));
  writeMetadata(metadata);
  fs.writeFileSync(path.join(directory, 'index.hbc'), `${context.commit} https://bridge.kfpa.or.kr 1.2.3`);
  assert.doesNotThrow(() => verifyOtaBundle(directory, context));
  fs.writeFileSync(path.join(directory, 'index.hbc'), 'stale bundle');
  assert.throws(() => verifyOtaBundle(directory, context), /커밋/);
  writeMetadata({ fileMetadata: { android: { bundle: '../index.hbc' } } });
  assert.throws(() => verifyOtaBundle(directory, context), /메타데이터/);
});

test('EAS JSON parsing accepts config log prefixes without confusing a log line for JSON', () => {
  assert.deepEqual(parseEasJson('[app.config] API=production\n[{"id":"verified"}]'), [{ id: 'verified' }]);
  assert.deepEqual(parseEasJson('{"currentPage":[]}'), { currentPage: [] });
  assert.throws(() => parseEasJson('only log output'), /JSON/);
});

test('OTA manifest parsing uses the manifest part and rejects directives without a manifest', () => {
  const manifest = { id: projectId, runtimeVersion: '1.11.0' };
  const body = `--expo\r\nContent-Disposition: form-data; name="extensions"\r\n\r\n{}\r\n--expo\r\nContent-Disposition: form-data; name="manifest"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(manifest)}\r\n--expo--\r\n`;
  assert.deepEqual(parseOtaManifest(body, 'multipart/mixed; boundary=expo'), manifest);
  assert.deepEqual(parseOtaManifest(JSON.stringify(manifest), 'application/expo+json'), manifest);
  assert.throws(() => parseOtaManifest('--expo--', 'multipart/mixed; boundary=expo'), /manifest/);
});

test('Node CA override is process-local and respects an existing environment setting', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ota-trust-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, '.release-config.local'), JSON.stringify({ nodeExtraCaCerts: 'ca.pem' }));
  fs.writeFileSync(path.join(root, 'ca.pem'), 'public certificates');
  const base = { EXISTING: 'value' };
  assert.equal(nodeTrustEnvironment(root, base).NODE_EXTRA_CA_CERTS, path.join(root, 'ca.pem'));
  assert.equal(base.NODE_EXTRA_CA_CERTS, undefined);
  assert.equal(nodeTrustEnvironment(root, { NODE_EXTRA_CA_CERTS: 'existing.pem' }).NODE_EXTRA_CA_CERTS, 'existing.pem');
});
