import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export function run(root, command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, env: process.env, windowsHide: true, stdio: 'inherit', ...options });
  if (result.error || result.status !== 0) throw new Error(`${path.basename(command)} 실행 실패 (${result.status ?? result.error?.code})`);
  return result.stdout?.toString().trim() ?? '';
}

export const git = (root, ...args) => run(root, 'git', args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });

export function npm(root, args, env = process.env) {
  const cli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  run(root, process.execPath, [cli, ...args], { env });
}

export function assertClean(root) {
  if (git(root, 'status', '--porcelain')) throw new Error('작업 트리가 깨끗하지 않습니다. 변경 사항을 먼저 커밋하세요.');
}

export function repository(root) {
  const remote = git(root, 'remote', 'get-url', 'origin');
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(remote);
  if (!match) throw new Error('origin은 GitHub 저장소여야 합니다.');
  return match[1];
}

export function assertRemoteTag(root, tag, commit = git(root, 'rev-parse', 'HEAD')) {
  if (!/^v\d+\.\d+\.\d+(?:-[0-9a-zA-Z.-]+)?$/.test(tag)) throw new Error('릴리스 태그 형식이 올바르지 않습니다.');
  const refs = git(root, 'ls-remote', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`)
    .split(/\r?\n/).filter(Boolean).map(line => line.split('\t'));
  const resolved = refs.find(([, ref]) => ref.endsWith('^{}'))?.[0] ?? refs[0]?.[0];
  if (resolved !== commit) throw new Error('원격 태그와 현재 커밋이 다르거나 태그가 없습니다. 태그를 덮어쓰지 않습니다.');
}

export function github(root) {
  const repo = repository(root);
  let token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) {
    let credentials;
    try {
      credentials = execFileSync('git', ['-c', 'credential.interactive=never', 'credential', 'fill'], {
        cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
        input: `protocol=https\nhost=github.com\npath=${repo}.git\n\n`,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
      });
    } catch { throw new Error('GitHub 인증이 필요합니다. Git Credential Manager 또는 GH_TOKEN을 설정하세요.'); }
    token = credentials.split(/\r?\n/).find(line => line.startsWith('password='))?.slice(9);
  }
  if (!token) throw new Error('GitHub 인증 정보를 찾지 못했습니다.');
  return async (method, endpoint, body, file) => {
    const url = new URL(endpoint.startsWith('https://') ? endpoint : `https://api.github.com/repos/${repo}${endpoint ? '/' + endpoint : ''}`);
    if (url.protocol !== 'https:' || !['api.github.com', 'uploads.github.com'].includes(url.hostname)) throw new Error('허용되지 않은 GitHub API 주소입니다.');
    let response;
    try {
      response = await fetch(url, {
        method, redirect: 'error', signal: AbortSignal.timeout(file ? 900_000 : 120_000),
        headers: {
          Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'local-pc-release',
          ...(body || file ? { 'Content-Type': file ? 'application/octet-stream' : 'application/json' } : {}),
        },
        ...(file ? { body: fs.readFileSync(file) } : body ? { body: JSON.stringify(body) } : {}),
      });
    } catch { throw new Error('GitHub API 연결에 실패했습니다. 네트워크와 인증 상태를 확인하세요.'); }
    if (response.status === 404 && method === 'GET') return null;
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(`GitHub API ${response.status}: ${data.message ?? '요청 실패'}`);
    }
    return response.status === 204 ? null : response.json();
  };
}

export function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function collect(root, version, commit, files, metadata = {}) {
  const out = path.join(root, 'dist-release', version);
  fs.mkdirSync(out, { recursive: true });
  const assets = files.map(({ source, name, signature, minimum = 1_000_000 }) => {
    if (path.basename(name) !== name || !/^[\w.-]+$/.test(name)) throw new Error('올바르지 않은 산출물 이름입니다.');
    if (!fs.existsSync(source) || fs.statSync(source).size < minimum) throw new Error(`산출물이 없거나 너무 작습니다: ${name}`);
    if (signature && fs.readFileSync(source).subarray(0, signature.length).toString('hex') !== signature.toString('hex')) throw new Error(`산출물 형식이 다릅니다: ${name}`);
    const target = path.join(out, name);
    fs.copyFileSync(source, target);
    return target;
  });
  const info = path.join(out, 'BUILD-INFO.json');
  fs.writeFileSync(info, JSON.stringify({ version, commit, builder: 'local-pc', builtAt: new Date().toISOString(), ...metadata }, null, 2) + '\n');
  assets.push(info);
  const checksums = path.join(out, 'SHA256SUMS.txt');
  fs.writeFileSync(checksums, assets.map(file => `${sha256(file)}  ${path.basename(file)}`).join('\n') + '\n');
  return [...assets, checksums];
}

export function preparedAssets(root, version, commit) {
  const out = path.join(root, 'dist-release', version);
  const info = JSON.parse(fs.readFileSync(path.join(out, 'BUILD-INFO.json'), 'utf8'));
  if (info.version !== version || info.commit !== commit || info.builder !== 'local-pc') throw new Error('기존 빌드 출처와 현재 커밋/버전이 다릅니다.');
  const checksumFile = path.join(out, 'SHA256SUMS.txt');
  const files = fs.readFileSync(checksumFile, 'utf8').trim().split(/\r?\n/).map(line => {
    const match = /^([a-f0-9]{64})  ([\w.-]+)$/.exec(line);
    if (!match || path.basename(match[2]) !== match[2]) throw new Error('체크섬 파일 형식이 다릅니다.');
    const file = path.join(out, match[2]);
    if (sha256(file) !== match[1]) throw new Error(`기존 빌드 체크섬이 다릅니다: ${match[2]}`);
    return file;
  });
  if (!files.includes(path.join(out, 'BUILD-INFO.json')) || !files.some(file => /\.(exe|apk)$/.test(file))) throw new Error('기존 빌드 산출물이 빠져 있습니다.');
  return [...files, checksumFile];
}

export function verifyAsset(remote, local) {
  if (remote.size !== fs.statSync(local).size || remote.state !== 'uploaded') throw new Error(`GitHub 자산이 온전하지 않습니다: ${path.basename(local)}`);
  if (remote.digest && remote.digest !== `sha256:${sha256(local)}`) throw new Error(`GitHub 자산 체크섬이 다릅니다: ${path.basename(local)}`);
}

// Create a draft first. Never replace an existing asset or publish a partial upload.
export async function publish({ api, tag, commit, name, body, files, prerelease = false }) {
  let release = await api('GET', `releases/tags/${encodeURIComponent(tag)}`);
  if (!release) release = await api('POST', 'releases', { tag_name: tag, target_commitish: commit, name, body, draft: true, prerelease });
  if (release.tag_name !== tag) throw new Error('릴리스 태그가 다릅니다.');
  let assets = await api('GET', `releases/${release.id}/assets?per_page=100`);
  for (const file of files) {
    const asset = assets.find(item => item.name === path.basename(file));
    if (asset) { verifyAsset(asset, file); continue; }
    if (!release.draft) throw new Error('이미 공개된 릴리스에 파일이 빠져 있습니다. 자동으로 변경하지 않습니다.');
    const upload = new URL(release.upload_url.replace(/\{.*$/, ''));
    upload.searchParams.set('name', path.basename(file));
    const uploaded = await api('POST', upload.href, undefined, file);
    verifyAsset(uploaded, file);
  }
  assets = await api('GET', `releases/${release.id}/assets?per_page=100`);
  for (const file of files) {
    const asset = assets.find(item => item.name === path.basename(file));
    if (!asset) throw new Error(`GitHub 릴리스 자산 누락: ${path.basename(file)}`);
    verifyAsset(asset, file);
  }
  if (release.draft) release = await api('PATCH', `releases/${release.id}`, { draft: false, prerelease, make_latest: prerelease ? 'false' : 'true' });
  console.log(`릴리스 공개 완료: ${release.html_url}`);
  return release;
}
