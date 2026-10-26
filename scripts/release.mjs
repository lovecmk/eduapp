#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import versionCore from './version-core.cjs';
import { git, run, assertClean, github } from './lib/local-release.mjs';
import { releaseVersion, buildLocal, publishLocal } from './release-local.mjs';
import { preflightOta, publishOta } from './release-ota.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = ['app.json', 'version.json', 'public/version.json'];
let snapshots;
let committed = false;
try {
  const args = process.argv.slice(2);
  if (new Set(args).size !== args.length || args.some(arg => !['--dry-run', '--resume', '--apk-only'].includes(arg)) || args.includes('--dry-run') && args.includes('--resume')) throw new Error('사용: npm run release -- [--dry-run|--resume] [--apk-only] (기본 APK+OTA, --apk-only는 APK만)');
  const resume = args.includes('--resume');
  const withOta = !args.includes('--apk-only');
  assertClean(root);
  if (git(root, 'branch', '--show-current') !== 'main') throw new Error('main 브랜치에서 실행하세요.');
  git(root, 'fetch', 'origin', 'main');
  git(root, 'merge-base', '--is-ancestor', 'origin/main', 'main');
  const api = github(root);
  if (!await api('GET', '')) throw new Error('GitHub 저장소 접근 권한이 없습니다.');
  if (withOta) preflightOta();
  const tags = [...git(root, 'tag', '--list').split(/\r?\n/), ...git(root, 'ls-remote', '--tags', 'origin').split(/\r?\n/).map(line => line.split('\t')[1]?.replace('refs/tags/', ''))].filter(Boolean);
  if (!resume) {
    snapshots = new Map(files.map(file => [file, fs.readFileSync(path.join(root, file))]));
    run(root, process.execPath, ['scripts/bump-version.mjs'], { env: { ...process.env, GITHUB_SHA: git(root, 'rev-parse', 'HEAD') } });
  }
  const { version } = releaseVersion();
  for (const tag of tags) {
    if (/^v\d+\.\d+\.\d+/.test(tag) && versionCore.compareSemver(versionCore.parseSemver(version), versionCore.parseSemver(tag.slice(1))) <= 0) throw new Error(`새 버전은 기존 태그 ${tag}보다 커야 합니다.`);
  }
  const changed = git(root, 'diff', '--name-only').split(/\r?\n/).filter(Boolean);
  if (changed.some(file => !files.includes(file))) throw new Error('버전 파일 외 변경 사항이 발생했습니다.');
  if (args.includes('--dry-run')) {
    for (const [file, contents] of snapshots) fs.writeFileSync(path.join(root, file), contents);
    snapshots = null;
    assertClean(root);
    console.log(`dry-run 성공: ${version} 버전 커밋 → PC 검증·APK 빌드 → 태그 → main+태그 atomic push → Release 게시${withOta ? ' → PC OTA 게시' : ' (APK만)'}`);
  } else {
    if (!resume) {
      git(root, 'add', '--', ...files);
      git(root, 'commit', '-m', `release: ${version} PC 로컬 빌드 배포`);
    }
    committed = true;
    const prepared = await buildLocal();
    git(root, 'tag', prepared.tag);
    git(root, 'push', '--atomic', 'origin', 'main', prepared.tag);
    await publishLocal(prepared, api);
    if (withOta) await publishOta({ tag: prepared.tag, api });
  }
} catch (error) {
  if (snapshots && !committed) for (const [file, contents] of snapshots) fs.writeFileSync(path.join(root, file), contents);
  console.error(`릴리스 중단: ${error.message}`);
  process.exitCode = 1;
}
