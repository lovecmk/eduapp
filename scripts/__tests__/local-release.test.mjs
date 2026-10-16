import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { collect, preparedAssets, publish, sha256, verifyAsset, assertRemoteTag } from '../lib/local-release.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'local-release-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const exe = path.join(root, 'app.exe');
  fs.writeFileSync(exe, 'MZ-fixture');
  const files = collect(root, '1.2.3', 'abc', [{ source: exe, name: 'app.exe', signature: Buffer.from('MZ'), minimum: 1 }]);
  return { root, files };
}

function server(files, { missing = false, conflicting = false, published = false } = {}) {
  const calls = [];
  const assets = conflicting ? [{ name: 'app.exe', size: 1, state: 'uploaded' }] : [];
  const release = { id: 1, tag_name: 'v1.2.3', draft: !published, upload_url: 'https://uploads.github.com/test{?name}', html_url: 'https://github.com/test/releases/tag/v1.2.3' };
  const api = async (method, endpoint, body, file) => {
    calls.push({ method, endpoint, body });
    if (method === 'GET' && endpoint.startsWith('releases/tags/')) return published || conflicting ? release : null;
    if (method === 'GET') return missing ? [] : [...assets];
    if (file) {
      const asset = { name: path.basename(file), size: fs.statSync(file).size, state: 'uploaded', digest: `sha256:${sha256(file)}` };
      assets.push(asset);
      return asset;
    }
    return { ...release, ...body };
  };
  return { api, calls, options: { api, tag: 'v1.2.3', commit: 'abc', name: 'test', body: 'test', files } };
}

test('publishes only after draft upload and verification', async t => {
  const { files } = fixture(t);
  const { calls, options } = server(files);
  await publish(options);
  assert.equal(calls.find(call => call.method === 'POST').body.draft, true);
  assert.equal(calls.at(-1).method, 'PATCH');
  assert.equal(calls.at(-1).body.draft, false);
});

test('missing remote asset leaves the draft unpublished', async t => {
  const { files } = fixture(t);
  const { calls, options } = server(files, { missing: true });
  await assert.rejects(publish(options), /자산 누락/);
  assert.equal(calls.some(call => call.method === 'PATCH'), false);
});

test('conflicting assets are never deleted or overwritten', async t => {
  const { files } = fixture(t);
  const { calls, options } = server(files, { conflicting: true });
  await assert.rejects(publish(options), /온전하지/);
  assert.equal(calls.some(call => call.method !== 'GET'), false);
});

test('published releases are not automatically extended', async t => {
  const { files } = fixture(t);
  const { calls, options } = server(files, { published: true });
  await assert.rejects(publish(options), /이미 공개된/);
  assert.equal(calls.some(call => call.method !== 'GET'), false);
});

test('resume requires matching provenance and checksum', t => {
  const { root, files } = fixture(t);
  assert.deepEqual(preparedAssets(root, '1.2.3', 'abc'), files);
  assert.throws(() => preparedAssets(root, '1.2.3', 'different'), /출처/);
  fs.appendFileSync(files[0], 'tampered');
  assert.throws(() => preparedAssets(root, '1.2.3', 'abc'), /체크섬/);
});

test('artifact validation rejects wrong binary and path traversal', t => {
  const { root, files } = fixture(t);
  assert.throws(() => collect(root, '1.2.3', 'abc', [{ source: files[0], name: '../app.exe', minimum: 1 }]), /이름/);
  assert.throws(() => collect(root, '1.2.3', 'abc', [{ source: files[0], name: 'app.apk', minimum: 1, signature: Buffer.from('PK') }]), /형식/);
});

test('same-size remote checksum mismatch is rejected', t => {
  const { files } = fixture(t);
  assert.throws(() => verifyAsset({ size: fs.statSync(files[0]).size, state: 'uploaded', digest: 'sha256:' + '0'.repeat(64) }, files[0]), /체크섬/);
});

test('remote tag must point to the exact source commit', t => {
  const { root } = fixture(t);
  const remote = path.join(root, 'remote.git');
  const work = path.join(root, 'work');
  const command = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  command(root, 'init', '--bare', remote);
  fs.mkdirSync(work);
  command(work, 'init', '-b', 'main');
  command(work, 'config', 'user.name', 'Release Test');
  command(work, 'config', 'user.email', 'release@example.test');
  command(work, 'remote', 'add', 'origin', remote);
  command(work, 'commit', '--allow-empty', '-m', 'source');
  command(work, 'tag', '-a', 'v1.2.3', '-m', 'test');
  command(work, 'push', '--atomic', 'origin', 'main', 'v1.2.3');
  assert.doesNotThrow(() => assertRemoteTag(work, 'v1.2.3'));
  command(work, 'commit', '--allow-empty', '-m', 'different source');
  assert.throws(() => assertRemoteTag(work, 'v1.2.3'), /현재 커밋/);
});

test('hosted release builds have no push trigger', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  for (const name of ['build.yml', 'build-apk.yml', 'deploy.yml', 'eas-update.yml']) {
    const file = path.join(root, '.github/workflows', name);
    if (fs.existsSync(file)) {
      const workflow = fs.readFileSync(file, 'utf8');
      assert.doesNotMatch(workflow, /^  push:/m, name);
      assert.match(workflow, /^  workflow_dispatch:/m, name);
    }
  }
});
