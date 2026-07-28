import fs from 'fs';
import path from 'path';

/**
 * 스위치는 이름이 없으면 "스위치, 켬"으로만 읽힌다.
 *
 * 이 스위치는 트랙과 썸만 그리는 커스텀 컴포넌트라 안에 읽을 글자가 없다.
 * 옆에 보이는 설정 제목은 별개의 요소여서 스크린리더가 묶어 주지 않는다.
 * 그래서 label 없이 쓰면 사용자는 **무엇을** 켜고 끄는지 모른 채 토글하게 된다.
 *
 * 한 번 고쳐도 새 설정 항목을 추가할 때 또 빠지므로, 소스에서 직접 막는다.
 * (렌더 테스트로는 모든 호출부를 다 돌 수 없어 정적 검사로 둔다)
 */

const ROOT = path.resolve(__dirname, '../../../..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__') continue;
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/**
 * `<Switch ... />` 여는 태그를 통째로 집는다.
 *
 * `[^>]*` 로 잡으면 안 된다 — 화살표 함수(`onValueChange={(v) => …}`)의 `>` 에서
 * 태그가 끝난 것으로 오인해, 정작 검사해야 할 호출부를 통째로 놓친다.
 * 그래서 중괄호 깊이를 세면서 태그 밖에 있는 `>` 만 끝으로 인정한다.
 */
function switchTags(src: string): string[] {
  const tags: string[] = [];
  for (const m of src.matchAll(/<Switch\b/g)) {
    const start = m.index!;
    let depth = 0;
    for (let i = start; i < src.length; i += 1) {
      const ch = src[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      else if (ch === '>' && depth === 0) {
        tags.push(src.slice(start, i + 1));
        break;
      }
    }
  }
  return tags;
}

describe('Switch 접근성', () => {
  it('앱 전체에서 이름 없는 스위치를 쓰지 않는다', () => {
    const files = [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'src'))];
    const nameless: string[] = [];

    for (const file of files) {
      // 스위치 컴포넌트 자신은 label 을 '받는' 쪽이라 제외한다.
      if (file.endsWith(path.join('ui', 'Switch.tsx'))) continue;
      const src = fs.readFileSync(file, 'utf8');
      for (const tag of switchTags(src)) {
        if (!/\blabel[=\s]/.test(tag)) {
          nameless.push(`${path.relative(ROOT, file)}: ${tag.replace(/\s+/g, ' ').slice(0, 90)}`);
        }
      }
    }

    expect(nameless).toEqual([]);
  });

  it('검사기 자체가 동작한다 — label 없는 태그를 실제로 잡아낸다', () => {
    // 위 테스트가 '한 건도 못 찾아서' 통과하는 상황을 막는다.
    expect(switchTags('<Switch value={a} onValueChange={b} />')).toHaveLength(1);
    expect(switchTags('<Switch label="x" value={a} onValueChange={b} />')[0]).toContain('label=');
  });

  it('화살표 함수가 들어 있어도 태그를 끝까지 읽는다', () => {
    // `[^>]*` 로 잡으면 `=>` 의 `>` 에서 잘려, label 없는 호출부를 놓친다.
    const [tag] = switchTags('<Switch value={!m} onValueChange={(v) => setMute(t, !v)} />');
    expect(tag).toContain('onValueChange');
    expect(tag).toMatch(/\/>$/);
    expect(/\blabel[=\s]/.test(tag!)).toBe(false);
  });
});
