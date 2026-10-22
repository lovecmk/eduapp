import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const bundle = resolve(process.argv[2] ?? 'dist');
const baseline = process.argv.includes('--baseline');
const out = resolve(tmpdir(), baseline ? 'haru-home-quote-layout-before' : 'haru-home-quote-layout-after');
mkdirSync(out, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.otf': 'font/otf', '.ttf': 'font/ttf' };
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/eduapp(?=\/|$)/, '');
  let file = resolve(bundle, '.' + pathname);
  if (!file.startsWith(bundle + '/') && !file.startsWith(bundle + '\\') && file !== bundle) { response.writeHead(403).end(); return; }
  if (!existsSync(file) || !extname(file) || statSync(file).isDirectory()) file = resolve(bundle, 'index.html');
  response.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
  response.end(readFileSync(file));
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = 'http://127.0.0.1:' + server.address().port;
const user = { id: 'home-quote-qa', user_nm: '홈 화면 점검', nickname: 'QA', role_cd: 'USER', membership_cd: 'BASIC', status_cd: 'A' };
const cards = Array.from({ length: 5 }, (_, i) => ({ id: `home-${i}`, category_cd: 'ELEC', title_txt: `점검 ${i}`, question_txt: '안전 수칙을 확인합니다.', status_cd: i < 2 ? 'MASTERED' : 'NEW', difficulty_cd: 'EASY', card_type_cd: 'OX', format_nm: 'OX형', answer_txt: 'O', choices: ['O', 'X'], answer_index: 0, principle_txt: '안전 수칙' }));
const results = [], errors = [], writes = [];
let browser;
try {
  browser = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge' } : {});
  for (const theme of ['light', 'dark']) for (const width of [320, 390]) for (const fontScale of ['medium', 'xlarge']) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, timezoneId: 'America/Los_Angeles' });
    await context.addInitScript(({ user, theme, fontScale }) => {
      localStorage.setItem('accessToken', 'isolated-home'); localStorage.setItem('refreshToken', 'isolated-home');
      localStorage.setItem('cachedUser', JSON.stringify(user)); localStorage.setItem('session-owner-id', user.id);
      localStorage.setItem('faction', JSON.stringify({ state: { faction: 'frost' }, version: 0 }));
      localStorage.setItem('app-settings', JSON.stringify({ state: { themeMode: theme, fontScale }, version: 2 }));
      localStorage.setItem(`daily-learning-welcome:v1:${encodeURIComponent(user.id)}`, JSON.stringify({ days: ['2026-10-22', '2026-10-23'], day: '2026-10-23', quoteIndex: 0 }));
    }, { user, theme, fontScale });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (!url.pathname.startsWith('/inner/api/v1/')) { assert.equal(url.origin, origin); return route.continue(); }
      const path = url.pathname.slice('/inner/api/v1'.length);
      if (route.request().method() !== 'GET') writes.push(path);
      let body = {};
      if (path === '/auth/me') body = user;
      else if (path === '/me/faction') body = { faction_cd: 'frost' };
      else if (path === '/cards') body = cards;
      else if (path === '/learning/today') body = { day: '2026-9-22', target_count: 5, done_count: 0, difficulty_cd: 'EASY', cards: cards.map(card => ({ ...card, kind: 'NEW', done: false })) };
      else if (path === '/learning/quota') body = { limit: 5, used: 0 };
      else if (path === '/stats') body = { streak_days: 0, total_learned: 2, total_cards: 5, weekly: [], category_breakdown: [], rankings: [] };
      else if (path === '/community/live') body = { online_now: 0, studied_today: 0, leaderboard: [], companions: [], activities: [] };
      else if (path === '/engagement') body = { liked_ids: [], bookmarked_ids: [] };
      else if (/\/(feed|qna|notifications|tips|users|support)$/.test(path)) body = [];
      if (path === '/learning/calendar') return route.fulfill({ status: 404, json: {} });
      await route.fulfill({ status: 200, json: body });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: new Date('2026-10-22T14:59:00Z') });
    await page.goto(origin + '/eduapp/');
    await expect(page.getByTestId('home-learning-summary')).toBeVisible();
    await page.waitForTimeout(500);
    if (baseline) await page.evaluate(() => {
      const hero = [...document.querySelectorAll('div')].filter(el => el.textContent.includes('오늘도 반가워요') && getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)' && parseFloat(getComputedStyle(el).borderRadius) > 18).sort((a, b) => a.clientHeight - b.clientHeight)[0];
      hero?.setAttribute('data-testid', 'home-hero');
      [...document.querySelectorAll('[role=button]')].find(el => el.textContent.includes('오늘 학습 시작'))?.setAttribute('data-testid', 'home-study-cta');
    });
    const hero = page.getByTestId('home-hero'), cta = page.getByTestId('home-study-cta');
    const heroBox = await hero.boundingBox(), ctaBox = await cta.boundingBox();
    const studyBox = await cta.locator('..').boundingBox();
    assert(heroBox && ctaBox && studyBox);
    if (!baseline) {
      const quote = page.getByTestId('home-daily-quote');
      const first = await quote.innerText();
      assert(first.length > 10);
      await expect(hero).not.toContainText('미션 클리어');
      assert(ctaBox.height >= 172);
      const color = await cta.evaluate(el => getComputedStyle(el).backgroundColor);
      assert(theme === 'light' ? color === 'rgb(21, 128, 61)' : color === 'rgb(22, 101, 52)');
      assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1));
      assert(heroBox.x >= 0 && heroBox.x + heroBox.width <= width);
      await expect(cta).toBeInViewport();
      await page.screenshot({ path: resolve(out, `${theme}-${width}-${fontScale}.png`) });
      if (theme === 'light' && width === 320 && fontScale === 'medium') {
        await page.reload();
        await expect(quote).toHaveText(first);
        await page.clock.setSystemTime(new Date('2026-10-22T15:00:01Z'));
        await page.clock.runFor(30_000);
        await expect(quote).not.toHaveText(first);
      }
      if (theme === 'light' && width === 390 && fontScale === 'medium') {
        await cta.click();
        await page.waitForURL(/\/cards(?:\?|$)/);
      }
      results.push({ theme, width, fontScale, hero: heroBox.height, cta: ctaBox.height, study: studyBox.height });
    } else results.push({ theme, width, fontScale, hero: heroBox.height, cta: ctaBox.height, study: studyBox.height });
    await context.close();
  }
  assert.deepEqual(errors, []);
  assert(!writes.includes('/progress/grade') && !writes.includes('/progress/attendance'));
  writeFileSync(resolve(out, 'results.json'), JSON.stringify({ results, errors, writes }, null, 2));
  console.log(JSON.stringify({ results, errors, out }));
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
