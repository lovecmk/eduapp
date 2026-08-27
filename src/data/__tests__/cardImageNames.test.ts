import fs from 'fs';
import path from 'path';

/**
 * 번들 사진 파일 이름이 안드로이드 리소스 이름으로 **부딪히지 않는가**.
 *
 * 안드로이드 빌드는 번들 사진을 drawable 리소스로 옮기면서 이름에서 글자·숫자·
 * 밑줄이 아닌 것을 **지운다**(react-native/assets-registry 의
 * getAndroidResourceIdentifier). 하이픈이 사라지므로 `1-1.png` 과 `11.jpg` 는
 * 둘 다 `assets_img_11` 이 되고, APK 빌드가 "Duplicate resources" 로 통째로
 * 깨진다 — 실제로 그렇게 깨졌다.
 *
 * 이 사고는 **릴리스 빌드에서만** 드러난다. 웹도, 개발 서버도, 화면 테스트도
 * 파일 경로를 그대로 쓰기 때문에 아무 일 없이 지나간다. 그래서 사진을 한 장
 * 추가하는 평범한 작업이 CI 를 몇십 분 태우고 나서야 실패로 돌아온다.
 * 여기서 미리 막는다.
 */

/** react-native/assets-registry 의 getAndroidResourceIdentifier 와 같은 규칙. */
function androidResourceName(assetPath: string): string {
  return assetPath
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '') // 확장자는 리소스 이름에 들어가지 않는다
    .replace(/\//g, '_')
    .replace(/([^a-z0-9_])/g, '')
    .replace(/^assets_/, '');
}

const ROOT = path.resolve(__dirname, '../../..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'src/data/cardImages.ts'), 'utf8');
const REFERENCED = [...SOURCE.matchAll(/require\('\.\.\/\.\.\/(assets\/img\/[^']+)'\)/g)].map((m) => m[1]);

describe('번들 사진 파일 이름', () => {
  it('cardImages 가 실제로 사진을 가리키고 있다(경로가 살아 있다)', () => {
    expect(REFERENCED.length).toBeGreaterThan(0);
    const missing = REFERENCED.filter((p) => !fs.existsSync(path.join(ROOT, p)));
    expect(missing).toEqual([]);
  });

  it('안드로이드 리소스 이름이 서로 부딪히지 않는다', () => {
    const collisions: Record<string, string[]> = {};
    for (const p of REFERENCED) {
      const name = androidResourceName(p);
      (collisions[name] ??= []).push(p);
    }
    const duplicated = Object.entries(collisions).filter(([, files]) => files.length > 1);
    expect(duplicated).toEqual([]);
  });

  it('assets/img 의 모든 파일이 규칙(하이픈 없음)을 지킨다 — 아직 안 쓰는 사진도 함께 빌드된다', () => {
    const dir = path.join(ROOT, 'assets/img');
    const hyphenated = fs.readdirSync(dir).filter((f) => f.includes('-'));
    expect(hyphenated).toEqual([]);
  });

  it('규칙을 어기면 잡아낸다(판정 자체가 살아 있는지)', () => {
    expect(androidResourceName('assets/img/1-1.png')).toBe('img_11');
    expect(androidResourceName('assets/img/11.jpg')).toBe('img_11');
    expect(androidResourceName('assets/img/1_1.png')).toBe('img_1_1');
  });
});
