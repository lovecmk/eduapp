import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const bundle = resolve(process.argv[2] ?? 'dist');
const baselineMode = process.argv.includes('--baseline');
const out = resolve(tmpdir(), 'haru-card-timer-qa');
mkdirSync(out, { recursive: true });
const baselineFile = resolve(out, 'baseline.json');
const baseline = !baselineMode && existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, 'utf8')) : {};
const sizes = {}, errors = [];
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf' };
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/eduapp(?=\/|$)/, '');
  let file = resolve(bundle, '.' + pathname);
  if (!file.startsWith(bundle + '/') && !file.startsWith(bundle + '\\') && file !== bundle) { response.writeHead(403).end(); return; }
  if (!existsSync(file) || !extname(file) || statSync(file).isDirectory()) file = resolve(bundle, 'index.html');
  response.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream'); response.end(readFileSync(file));
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge' } : {});
try {
  for (const width of [320, 390]) for (const theme of ['light', 'dark']) for (const track of ['classic', 'swipe']) for (const quiz of [false, true]) {
    const key = `${width}-${theme}-${track}-${quiz ? 'quiz' : 'text'}`;
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    const user = { id: 'timer-qa', user_nm: track === 'swipe' ? '원진섭' : '점검 사용자', nickname: 'QA', role_cd: 'USER', membership_cd: 'BASIC', status_cd: 'A' };
    await context.addInitScript(({ user, theme }) => {
      localStorage.setItem('accessToken', 'isolated-timer'); localStorage.setItem('refreshToken', 'isolated-timer');
      localStorage.setItem('cachedUser', JSON.stringify(user)); localStorage.setItem('session-owner-id', user.id);
      localStorage.setItem('faction', JSON.stringify({ state: { faction: 'frost' }, version: 0 }));
      localStorage.setItem('app-settings', JSON.stringify({ state: { themeMode: theme, fontScale: 'xlarge' }, version: 2 }));
      localStorage.setItem(`daily-learning-welcome:v1:${encodeURIComponent(user.id)}`, JSON.stringify({ day: '2026-10-26', quoteIndex: 0 }));
    }, { user, theme });
    const card = { id: 'timer-card', category_cd: 'ELEC', taxonomy_category_nm: '기타', sub_category_nm: '화재·폭발', topic_nm: '소화설비와 매우 긴 분류 경로를 확인하는 항목', title_txt: '소화설비 점검', question_txt: '현장의 안전 조건을 확인합니다. '.repeat(8), situation_txt: '현장의 소화설비를 확인합니다.', study_seconds: 10, card_type_cd: quiz ? 'CHOICE' : 'EXPLANATION', format_nm: quiz ? '객관식' : '상황형', choices: quiz ? ['가동한다', '점검한다'] : undefined, answer_index: quiz ? 1 : undefined, answer_txt: '점검한다', principle_txt: '점검 순서와 근거입니다.', status_cd: 'NEW', difficulty_cd: 'EASY', due_at: null };
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (!url.pathname.startsWith('/inner/api/v1/')) { assert.equal(url.origin, origin); return route.continue(); }
      const path = url.pathname.slice('/inner/api/v1'.length);
      let body = {};
      if (path === '/auth/me') body = user;
      else if (path === '/cards') body = [card];
      else if (path === '/learning/today') body = { day: '2026-9-26', cards: [{ ...card, kind: 'NEW', done: false }], target_count: 1, done_count: 0 };
      else if (path === '/learning/quota') body = { limit: 3, used: 0 };
      else if (path === '/progress') body = { cards: {}, history: {}, attendance: {} };
      else if (path === '/engagement') body = { liked_ids: [], bookmarked_ids: [] };
      else if (path === '/community/live') body = { companions: [], activities: [], leaderboard: [] };
      else if (path.endsWith('/difficulty')) body = { mine: null, easy: 0, normal: 0, hard: 0 };
      else if (/\/(feed|qna|notifications|tips|users|support)$/.test(path)) body = [];
      await route.fulfill({ status: 200, json: body });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: new Date('2026-10-26T03:00:00Z') });
    await page.goto(origin + '/eduapp/cards');
    const front = page.getByTestId('learning-card-front');
    await expect(front).toBeVisible(); await page.waitForTimeout(700);
    const bounds = await front.boundingBox(); sizes[key] = bounds.height;
    if (!baselineMode) {
      if (baseline[key]) assert(bounds.height >= baseline[key] + 35, `${key}: card gained less than 35px`);
      const header = page.getByTestId('learning-card-header'), category = page.getByTestId('learning-card-category'), timer = page.getByTestId('card-timer');
      await expect(header.getByTestId('card-timer')).toHaveCount(1);
      const timerBox = await timer.boundingBox(), categoryBox = await category.boundingBox(), headerBox = await header.boundingBox();
      assert(timerBox.height <= 30 && timerBox.y >= headerBox.y - 1 && timerBox.y + timerBox.height <= headerBox.y + headerBox.height + 1, 'compact timer aligns with breadcrumb');
      assert(categoryBox.x + categoryBox.width <= timerBox.x - 4, 'breadcrumb and timer do not overlap');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'narrow layout overflow');
      const scroll = page.getByTestId(quiz ? 'learning-card-quiz-scroll' : 'learning-card-front-scroll');
      await expect(scroll.getByTestId('card-timer')).toHaveCount(0);
      await scroll.evaluate(node => { node.scrollTop = node.scrollHeight; });
      await expect(timer).toBeInViewport({ ratio: 1 });
      await page.screenshot({ path: resolve(out, `${key}.png`) });
      if (quiz) await front.getByText('점검한다', { exact: true }).click();
      await page.getByRole('button', { name: '카드 뒤집기', exact: true }).click();
      await page.waitForTimeout(450);
      assert(Math.abs((await page.getByTestId('learning-card-back').boundingBox()).height - bounds.height) < 1, 'card height stays stable when flipped');
      if (!quiz && key === '390-light-classic-text') {
        await page.getByTestId('learning-card-back-tap').click(); await page.waitForTimeout(450);
        await expect(timer).toBeVisible();
        await page.clock.runFor(11000);
        await expect(timer).toHaveAttribute('aria-label', '생각할 시간 종료, 준비 완료');
        const fill = await page.getByTestId('card-timer-fill').boundingBox();
        const chip = await timer.boundingBox();
        assert(fill.width >= chip.width - 3, 'expired chip background is filled');
        assert.equal(await front.evaluate(node => getComputedStyle(node).pointerEvents), 'auto', 'expiry does not flip the card');
      }
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  writeFileSync(baselineMode ? baselineFile : resolve(out, 'results.json'), JSON.stringify(sizes, null, 2));
  console.log(JSON.stringify({ mode: baselineMode ? 'baseline' : 'verification', cases: Object.keys(sizes).length, sizes, out }));
} finally { await browser.close(); await new Promise(done => server.close(done)); }
