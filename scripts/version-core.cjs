/**
 * 배포 버전 계산 규칙 — 순수 함수만 모아 둔다.
 *
 * 왜 따로 떼어 두는가: 이 규칙은 GitHub Actions 안에서만 돌기 때문에 잘못돼도
 * 배포를 해 봐야 안다. 파일 입출력과 분리해 두면 여기서 표로 검증할 수 있다.
 *
 * CommonJS 로 쓴 이유: 배포 스크립트(ESM)와 테스트 러너(CJS)가 같은 파일을 봐야 한다.
 * 규칙을 두 벌로 적으면 한쪽만 고쳐져 조용히 어긋나는데, 그게 바로 이 파일이 막으려는 것이다.
 */

/**
 * 다음 semver 를 정한다.
 *
 * 규칙:
 *  1. app.json 의 버전이 마지막으로 배포된 버전보다 **높으면** 사람이 의도적으로
 *     올린 것이므로 그대로 존중한다(1.11.0 → 1.12.0 같은 기능 릴리스).
 *  2. 그 외에는 patch 를 1 올린다.
 *
 * 2번이 이 함수의 존재 이유다. 지금까지 buildNumber 만 올라가고 semver 는
 * app.json 에 적힌 값 그대로였다. 그래서 몇 번을 배포하든 사용자에게 보이는 버전은
 * 계속 같은 숫자였고, "업데이트했는데 버전이 그대로"인 상태가 됐다.
 *
 * 같은 날 여러 번 올려도 매번 새 버전이 나온다 — 날짜가 아니라 배포 횟수를 세기 때문이다.
 */
function nextVersion(appVersion, lastReleased) {
  const app = parseSemver(appVersion);
  const last = parseSemver(lastReleased);

  // app.json 을 사람이 먼저 올려 뒀다면 그 뜻을 따른다.
  if (compareSemver(app, last) > 0) return formatSemver(app);

  // 그렇지 않으면 마지막 배포 버전에서 patch 를 올린다.
  // (app.json 이 뒤처져 있어도 배포 버전은 절대 되돌아가지 않아야 한다)
  const base = compareSemver(app, last) < 0 ? last : app;
  return formatSemver({ major: base.major, minor: base.minor, patch: base.patch + 1 });
}

/** "1.2.3" → {major,minor,patch}. 읽을 수 없으면 0.0.0 으로 본다(배포를 막지 않는다). */
function parseSemver(raw) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(raw ?? '').trim());
  if (!m) return { major: 0, minor: 0, patch: 0 };
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function formatSemver({ major, minor, patch }) {
  return `${major}.${minor}.${patch}`;
}

/** a > b 면 양수, 같으면 0, a < b 면 음수. */
function compareSemver(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

/**
 * buildNumber 는 언제나 단조 증가한다.
 *
 * 되돌아가면 앱의 업데이트 감지(remote.buildNumber > current)가 깨져서,
 * 사용자가 새 배포를 받지 못하거나 옛 번들로 되돌아간다.
 */
function nextBuildNumber(previous) {
  const n = Number(previous);
  return (Number.isFinite(n) && n > 0 ? n : 0) + 1;
}

module.exports = { nextVersion, parseSemver, formatSemver, compareSemver, nextBuildNumber };
