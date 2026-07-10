#!/usr/bin/env node
/**
 * 배포 버전 카운터 & 매니페스트 생성기 — PART 5.3
 *
 * GitHub Actions 가 빌드 직전에 실행한다.
 *  1) 현재 `public/version.json` 의 buildNumber 를 읽어 +1 한다(단조 증가).
 *  2) app.json 의 semver 와 커밋 SHA, 빌드 시각을 합쳐 새 매니페스트를 만든다.
 *  3) `public/version.json`(웹 산출물 루트로 복사됨)과 루트 `version.json`(레포 기록용)에 쓴다.
 *  4) 후속 빌드 스텝이 번들에 값을 구울 수 있도록 GITHUB_ENV / GITHUB_OUTPUT 에 노출한다.
 *
 * 외부 의존성 없이 Node 표준 모듈만 사용해 어떤 러너에서도 안전하게 동작한다.
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicManifest = resolve(root, 'public/version.json');
const rootManifest = resolve(root, 'version.json');

function readJson(path, fallback) {
  try {
    if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    console.warn(`[bump-version] ${path} 파싱 실패, 기본값 사용:`, err.message);
  }
  return fallback;
}

const current = readJson(publicManifest, readJson(rootManifest, { buildNumber: 0 }));
const appConfig = readJson(resolve(root, 'app.json'), { expo: {} });

const previousBuild = Number.isFinite(current.buildNumber) ? current.buildNumber : 0;
const nextBuild = previousBuild + 1;

const manifest = {
  version: appConfig?.expo?.version ?? '1.0.0',
  buildNumber: nextBuild,
  commit: (process.env.GITHUB_SHA ?? 'local').slice(0, 40),
  buildTime: new Date().toISOString(),
};

const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
writeFileSync(publicManifest, serialized);
writeFileSync(rootManifest, serialized);

console.log(`[bump-version] buildNumber ${previousBuild} → ${nextBuild} (v${manifest.version})`);

// 후속 스텝에서 사용할 값 노출(GitHub Actions 컨텍스트에서만 존재).
if (process.env.GITHUB_ENV) {
  appendFileSync(
    process.env.GITHUB_ENV,
    [
      `APP_BUILD_NUMBER=${manifest.buildNumber}`,
      `APP_VERSION=${manifest.version}`,
      `APP_COMMIT=${manifest.commit}`,
      '',
    ].join('\n'),
  );
}
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `build_number=${manifest.buildNumber}\nversion=${manifest.version}\n`,
  );
}
