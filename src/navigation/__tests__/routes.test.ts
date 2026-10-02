import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { ROUTES } from '../../constants/routes';

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]);
}
const app = join(__dirname, '../../../app');
const pages = files(app).filter((file) => file.endsWith('.tsx') && !file.endsWith('_layout.tsx'));
const paths = pages.map((file) => file.slice(app.length).replace(/\\/g, '/').replace(/\.tsx$/, '').replace(/\/index$/, ''));

describe('앱 이동 경로', () => {
  it('모든 ROUTES 항목에 파일 기반 화면이 있다', () => {
    for (const value of Object.values(ROUTES)) {
      const route = typeof value === 'function' ? value('[id]') : value;
      const decoded = decodeURIComponent(route).replace('/collection/[id]', '/collection/[type]');
      expect(paths).toContain(decoded);
    }
  });
  it('테스트 파일을 앱 라우트/번들에 넣지 않는다', () => {
    expect(pages.some((file) => /__tests__|\.(test|spec)\./.test(file))).toBe(false);
    for (const page of pages) expect(readFileSync(page, 'utf8')).toMatch(/export default/);
  });
  it.each(['a/b', '한글?#', 'a b'])('동적 ID %s를 한 경로 조각으로 전달한다', (id) => {
    expect(ROUTES.content(id)).toBe('/content/' + encodeURIComponent(id));
    expect(ROUTES.qna(id)).toBe('/qna/' + encodeURIComponent(id));
    expect(ROUTES.publicProfile(id)).toBe('/u/' + encodeURIComponent(id));
  });
});
