#!/usr/bin/env node
/**
 * 배포 버전 카운터 & 매니페스트 생성기 — PART 5.3
 *
 * GitHub Actions 가 빌드 직전에 실행한다.
 *  1) 마지막 배포 매니페스트를 읽어 buildNumber 를 +1 한다(단조 증가).
 *  2) semver 도 함께 올린다 — app.json 을 사람이 먼저 올려 뒀으면 그 값을,
 *     아니면 patch 를 +1 한다. 계산 규칙은 version-core.mjs 에 있다.
 *  3) 올라간 semver 를 app.json 에 되써서 다음 배포의 기준이 되게 한다.
 *  4) `public/version.json`(웹 산출물 루트로 복사됨)과 루트 `version.json`(레포 기록용)에 쓴다.
 *  5) 후속 빌드 스텝이 번들에 값을 구울 수 있도록 GITHUB_ENV / GITHUB_OUTPUT 에 노출한다.
 *
 * 예전에는 buildNumber 만 올리고 semver 는 app.json 에 적힌 값을 그대로 썼다.
 * 그래서 몇 번을 배포하든 사용자에게 보이는 버전은 계속 같았고, 업데이트를 받아도
 * "버전이 그대로"인 상태가 됐다. 지금은 배포할 때마다 semver 가 함께 움직인다 —
 * 날짜가 아니라 배포 횟수를 세므로 같은 날 여러 번 올려도 매번 새 버전이 나온다.
 *
 * 외부 의존성 없이 Node 표준 모듈만 사용해 어떤 러너에서도 안전하게 동작한다.
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// 규칙 모듈은 CommonJS 다 — 테스트 러너와 같은 파일을 보게 하기 위해서다.
import versionCore from './version-core.cjs';

const { nextVersion, nextBuildNumber } = versionCore;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicManifest = resolve(root, 'public/version.json');
const rootManifest = resolve(root, 'version.json');
const appConfigPath = resolve(root, 'app.json');

function readJson(path, fallback) {
  try {
    if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    console.warn(`[bump-version] ${path} 파싱 실패, 기본값 사용:`, err.message);
  }
  return fallback;
}

const current = readJson(publicManifest, readJson(rootManifest, { buildNumber: 0 }));
const appConfig = readJson(appConfigPath, { expo: {} });

const previousBuild = current.buildNumber;
const requestedTag = process.argv[2] === '--check-tag' ? process.argv[3] : '';
const tagVersion = /^v(\d+\.\d+\.\d+)-[0-9a-f]+$/.exec(requestedTag ?? '')?.[1];
if (requestedTag?.startsWith('v') && !tagVersion) throw new Error('Invalid release tag');
if (tagVersion && (appConfig.expo.version !== tagVersion || current.version !== tagVersion)) throw new Error('Tag and version manifests differ');
const build = tagVersion ? previousBuild : nextBuildNumber(previousBuild);
const version = tagVersion ?? nextVersion(appConfig?.expo?.version, current.version);

const manifest = {
  version,
  buildNumber: build,
  commit: (process.env.GITHUB_SHA ?? 'local').slice(0, 40),
  // 빌드 시각은 매 배포마다 새로 찍는다 — 앱이 보여 주는 '최종 업데이트'가
  // 이 값이므로, 고정하면 화면의 날짜가 영영 멈춘 것처럼 보인다.
  buildTime: new Date().toISOString(),
};

const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
writeFileSync(publicManifest, serialized);
writeFileSync(rootManifest, serialized);

// app.json 에도 되써서 다음 배포가 이 값을 기준으로 올라가게 한다.
// (되쓰지 않으면 app.json 이 계속 옛 버전을 가리켜 매번 같은 patch 로만 올라간다)
if (appConfig?.expo && appConfig.expo.version !== version) {
  appConfig.expo.version = version;
  writeFileSync(appConfigPath, `${JSON.stringify(appConfig, null, 2)}\n`);
}

console.log(
  `[bump-version] build ${previousBuild ?? 0} → ${build}, version ${current.version ?? '-'} → ${version}`,
);

// 후속 스텝에서 사용할 값 노출(GitHub Actions 컨텍스트에서만 존재).
if (process.env.GITHUB_ENV) {
  appendFileSync(
    process.env.GITHUB_ENV,
    [
      `APP_BUILD_NUMBER=${manifest.buildNumber}`,
      `APP_VERSION=${manifest.version}`,
      `APP_COMMIT=${manifest.commit}`,
      `APP_BUILD_TIME=${manifest.buildTime}`,
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
