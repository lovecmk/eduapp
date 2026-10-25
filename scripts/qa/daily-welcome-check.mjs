import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const bundle = resolve(process.argv[2] ?? 'dist');
const out = resolve(tmpdir(), 'haru-daily-welcome-qa');
mkdirSync(out, { recursive: true });
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
let browser;
try {
  browser = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge' } : {});
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Los_Angeles' });
  const user = { id: 'completion-qa', user_nm: '점검 사용자', nickname: 'QA', role_cd: 'USER', membership_cd: 'BASIC', status_cd: 'A' };
  await context.addInitScript(user => {
    localStorage.setItem('accessToken', 'isolated-completion'); localStorage.setItem('refreshToken', 'isolated-completion');
    localStorage.setItem('cachedUser', JSON.stringify(user)); localStorage.setItem('session-owner-id', user.id);
    localStorage.setItem('faction', JSON.stringify({ state: { faction: 'frost' }, version: 0 }));
  }, user);
  const ids = ['c0', 'c1', 'c2', 'c3', 'c4'];
  const cards = ids.map((id, i) => ({ id, category_cd: 'ELEC', title_txt: `점검 ${i}`, question_txt: `안전 점검 ${i}`, status_cd: i < 2 ? 'MASTERED' : 'LEARNING', difficulty_cd: 'EASY', card_type_cd: 'EXPLANATION', format_nm: '설명형', principle_txt: '안전 수칙', due_at: i === 4 ? '2026-10-25T00:00:00+09:00' : null }));
  let todayDone = 5;
  const goals = {}, history = {};
  for (const key of ['2026-6-31', '2026-7-3', ...[6, 7, 8, 9, 12, 14, 15, 16, 19, 20, 21, 22, 23, 24].map(day => `2026-9-${day}`)]) {
    goals[key] = { target_count: 5, card_ids: ids };
    history[key] = ids.slice(0, key === '2026-9-15' ? 1 : key === '2026-9-20' ? 3 : 5);
  }
  const holidays = JSON.parse(readFileSync(new URL('../../src/constants/learning-holidays.json', import.meta.url), 'utf8')).holidays;
  const errors = [], writes = [], checks = [];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/inner/api/v1/')) { assert.equal(url.origin, origin); return route.continue(); }
    const path = url.pathname.slice('/inner/api/v1'.length);
    if (route.request().method() !== 'GET') writes.push(path);
    let body = {};
    if (path === '/auth/me') body = user;
    else if (path === '/cards') body = cards;
    else if (path === '/learning/today') body = { day: '2026-9-23', target_count: 5, done_count: todayDone, difficulty_cd: 'EASY', cards: cards.map((card, i) => ({ ...card, kind: i < 3 ? 'NEW' : 'REVIEW', done: i < todayDone })) };
    else if (path === '/learning/quota') body = { limit: 3, used: 3 };
    else if (path === '/learning/calendar') {
      const year = Number(url.searchParams.get('year')), month = Number(url.searchParams.get('month'));
      body = { timezone: 'Asia/Seoul', year, month, days: Array.from({ length: new Date(Date.UTC(year, month, 0)).getUTCDate() }, (_, i) => {
        const date = `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
        const dow = new Date(Date.UTC(year, month - 1, i + 1)).getUTCDay();
        const name = date === '2026-10-22' ? '임시공휴일' : holidays[date] ?? '';
        return { date, can_learn_new: !name && dow !== 0 && dow !== 6, can_review: true, holiday_name: name, reason: name ? 'HOLIDAY' : dow === 0 || dow === 6 ? 'WEEKEND' : '' };
      }) };
    } else if (path === '/progress') body = { daily_goals: goals, history: { ...history, '2026-9-23': ids.slice(0, todayDone) }, attendance: { '2026-9-23': '2026-10-23T10:00:00+09:00' }, cards: { c4: { box: 0, reps: 1, last_grade: 'again', due_at: cards[4].due_at, last_reviewed_at: '2026-10-20T10:00:00+09:00' } } };
    else if (path === '/stats') body = { streak_days: 99, total_learned: 99, total_cards: 5, weekly: [], category_breakdown: [], rankings: [] };
    else if (path === '/community/live') body = { online_now: 0, studied_today: 0, leaderboard: [], companions: [], activities: [] };
    else if (path === '/engagement') body = { liked_ids: [], bookmarked_ids: [] };
    else if (/\/(feed|qna|notifications|tips|users|support)$/.test(path)) body = [];
    await route.fulfill({ status: 200, json: body });
  });

  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date('2026-10-23T03:00:00Z') });
  const welcome = page.getByTestId('daily-learning-welcome');
  const quote = page.getByTestId('daily-welcome-quote');
  const key = 'daily-learning-welcome:v1:' + encodeURIComponent(user.id);
  await page.goto(origin + '/eduapp/');
  await expect(welcome).toBeVisible();
  await expect(page.getByTestId('daily-welcome-streak')).toHaveText('2일');
  assert((await quote.innerText()).length > 10);
  const first = await quote.innerText();
  await page.getByRole('button', { name: '좋은 하루 시작하기', exact: true }).click();
  await expect(welcome).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('home-learning-summary')).toBeVisible();
  await page.waitForTimeout(700);
  await expect(welcome).toHaveCount(0);
  checks.push('first open, shared streak, close and persistent once per day');
  await page.clock.setSystemTime(new Date('2026-10-24T03:00:00Z'));
  await page.reload();
  await expect(welcome).toBeVisible();
  await expect(page.getByTestId('daily-welcome-streak')).toHaveText('2일');
  assert.notEqual(await quote.innerText(), first);
  checks.push('next KST day, random non-repeating quote and weekend streak retained');
  for (const theme of ['light', 'dark']) for (const width of [320, 390]) {
    await page.evaluate(({ key, theme }) => {
      localStorage.removeItem(key);
      localStorage.setItem('app-settings', JSON.stringify({ state: { themeMode: theme, fontScale: 'xlarge' }, version: 2 }));
    }, { key, theme });
    await page.setViewportSize({ width, height: 844 });
    await page.reload(); await expect(welcome).toBeVisible(); await page.waitForTimeout(400);
    const box = await welcome.boundingBox();
    assert(box && box.x >= 0 && box.x + box.width <= width + 1 && box.y >= 0 && box.y + box.height <= 844, 'popup fits narrow viewport');
    await expect(page.getByRole('button', { name: '좋은 하루 시작하기', exact: true })).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: resolve(out, 'welcome-' + theme + '-' + width + '.png') });
    checks.push({ theme, width });
  }
  await page.getByRole('button', { name: '좋은 하루 시작하기', exact: true }).click();
  for (const key of Object.keys(goals)) delete goals[key];
  for (const key of Object.keys(history)) delete history[key];
  todayDone = 0;
  await page.evaluate(key => { localStorage.removeItem(key); localStorage.removeItem('srs-scheduler'); }, key);
  await page.reload(); await expect(welcome).toBeVisible();
  await expect(page.getByTestId('daily-welcome-streak')).toHaveText('0일');
  await expect(page.getByText('오늘부터 한 걸음, 함께 시작해요', { exact: true })).toBeVisible();
  checks.push('new learner zero streak');
  assert(!writes.includes('/progress/attendance') && !writes.includes('/progress/grade'));
  assert.deepEqual(errors, []);
  writeFileSync(resolve(out, 'results.json'), JSON.stringify({ checks, errors, writes, note: 'isolated API, no production writes' }, null, 2));
  console.log(JSON.stringify({ checks: checks.length, errors, out }));
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
