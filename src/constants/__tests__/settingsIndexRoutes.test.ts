import fs from 'fs';
import path from 'path';
import { SETTINGS_INDEX } from '../settingsIndex';

/**
 * 검색 색인이 가리키는 자리가 실제로 존재하는가.
 *
 * 설정은 2-depth 를 유지하는 대신 검색 색인 하나로 전부 찾게 되어 있다. 그래서
 * 화면과 색인은 **함께** 손봐야 한다 — 실제로 한 번 어긋났었다(화면에서 항목을
 * 내렸는데 색인에 남아, 검색으로 들어가면 아무것도 없는 자리로 스크롤됐다).
 *
 * 검색 결과를 눌렀는데 아무 일도 일어나지 않으면 사용자는 설정 검색 자체를
 * 다시 쓰지 않는다. 사람이 두 파일을 대조하는 대신 여기서 대조한다.
 */
const ROOT = path.resolve(__dirname, '../../..');

const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** expo-router 경로 → 실제 파일이 있는가. */
function routeExists(route: string): boolean {
  return (
    fs.existsSync(path.join(ROOT, `app${route}.tsx`)) ||
    fs.existsSync(path.join(ROOT, `app${route}/index.tsx`))
  );
}

describe('설정 검색 색인', () => {
  it('모든 항목의 route 가 실재하는 화면을 가리킨다', () => {
    const broken = SETTINGS_INDEX.filter((e) => !routeExists(e.route)).map((e) => `${e.id} → ${e.route}`);
    expect(broken).toEqual([]);
  });

  it("설정 본문 항목은 화면에 같은 id 의 앵커가 있다(검색 → 하이라이트)", () => {
    const settings = read('app/settings.tsx');
    const anchors = new Set([...settings.matchAll(/anchorId="([^"]+)"/g)].map((m) => m[1]));
    const missing = SETTINGS_INDEX.filter((e) => e.route === '/settings' && !anchors.has(e.id)).map((e) => e.id);
    expect(missing).toEqual([]);
  });

  it('id 가 겹치지 않는다(같은 id 두 개면 하이라이트가 엉뚱한 곳으로 간다)', () => {
    const ids = SETTINGS_INDEX.map((e) => e.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it('라벨·검색어가 비어 있지 않다(검색으로 찾을 수 없는 항목을 만들지 않는다)', () => {
    const empty = SETTINGS_INDEX.filter((e) => !e.label.trim() || e.keywords.length === 0).map((e) => e.id);
    expect(empty).toEqual([]);
  });
});
