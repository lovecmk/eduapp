import { nextVersion, nextBuildNumber, parseSemver, compareSemver } from '../version-core.cjs';

// 이 규칙은 GitHub Actions 안에서만 돌아 잘못돼도 배포를 해 봐야 안다.
// 파일 입출력과 분리해 둔 덕에 여기서 표로 검증할 수 있다.

describe('nextVersion', () => {
  it('배포할 때마다 patch 가 오른다', () => {
    // 지금까지의 문제 — buildNumber 만 오르고 semver 는 app.json 값 그대로였다.
    // 그래서 몇 번을 배포하든 사용자에게 보이는 버전이 계속 같았다.
    expect(nextVersion('1.11.0', '1.11.0')).toBe('1.11.1');
    expect(nextVersion('1.11.1', '1.11.1')).toBe('1.11.2');
  });

  it('같은 날 여러 번 올려도 매번 새 버전이 나온다', () => {
    // 날짜가 아니라 배포 횟수를 세기 때문에 하루에 몇 번이든 구분된다.
    let app = '2.0.0';
    let released = '2.0.0';
    const seen = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const v = nextVersion(app, released);
      expect(seen.has(v)).toBe(false);
      seen.add(v);
      app = v;
      released = v;
    }
    expect([...seen]).toEqual(['2.0.1', '2.0.2', '2.0.3', '2.0.4', '2.0.5']);
  });

  it('사람이 app.json 을 먼저 올려 뒀으면 그 뜻을 따른다', () => {
    // 기능 릴리스에서 1.11.x → 1.12.0 으로 올린 경우, 자동 patch 가 덮어쓰면 안 된다.
    expect(nextVersion('1.12.0', '1.11.4')).toBe('1.12.0');
    expect(nextVersion('2.0.0', '1.11.4')).toBe('2.0.0');
  });

  it('app.json 이 뒤처져 있어도 배포 버전은 되돌아가지 않는다', () => {
    // 브랜치를 잘못 되돌렸을 때 옛 버전으로 배포되면 업데이트 감지가 깨진다.
    expect(nextVersion('1.9.0', '1.11.3')).toBe('1.11.4');
  });

  it('읽을 수 없는 버전에도 배포를 막지 않는다', () => {
    expect(nextVersion(undefined, undefined)).toBe('0.0.1');
    expect(nextVersion('망가진값', '1.2.3')).toBe('1.2.4');
  });
});

describe('nextBuildNumber', () => {
  it('언제나 단조 증가한다', () => {
    expect(nextBuildNumber(39)).toBe(40);
    expect(nextBuildNumber(0)).toBe(1);
  });

  it('값이 망가져 있어도 되돌아가지 않는다', () => {
    // 되돌아가면 앱의 업데이트 감지(remote > current)가 깨져 새 배포를 받지 못한다.
    expect(nextBuildNumber(undefined)).toBe(1);
    expect(nextBuildNumber(-5)).toBe(1);
    expect(nextBuildNumber('abc')).toBe(1);
  });
});

describe('parseSemver / compareSemver', () => {
  it('접미사가 붙어도 숫자 부분만 읽는다', () => {
    expect(parseSemver('1.2.3-beta.1')).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it('자리별로 비교한다', () => {
    expect(compareSemver(parseSemver('1.10.0'), parseSemver('1.9.9'))).toBeGreaterThan(0);
    expect(compareSemver(parseSemver('1.2.3'), parseSemver('1.2.3'))).toBe(0);
  });
});
