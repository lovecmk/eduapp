import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const bundle = resolve(process.argv[2] ?? 'dist');
const out = resolve(tmpdir(), 'haru-learning-completion-qa');
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
    localStorage.setItem(`daily-learning-welcome:v1:${encodeURIComponent(user.id)}`, JSON.stringify({ days: ['2026-10-23', '2026-10-24'], day: '2026-10-24', quoteIndex: 0 }));
    localStorage.setItem('faction', JSON.stringify({ state: { faction: 'frost' }, version: 0 }));
  }, user);
  const ids = ['c0', 'c1', 'c2', 'c3', 'c4'];
  const cards = ids.map((id, i) => ({ id, category_cd: 'ELEC', title_txt: `점검 ${i}`, question_txt: `안전 점검 ${i}`, status_cd: i < 2 ? 'MASTERED' : 'LEARNING', difficulty_cd: 'EASY', card_type_cd: 'EXPLANATION', format_nm: '설명형', principle_txt: '안전 수칙', due_at: i === 4 ? '2026-10-25T00:00:00+09:00' : null }));
  let todayDone = 3;
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
  const go = async () => {
    await page.goto(origin + '/eduapp/');
    await expect(page.getByTestId('home-learning-summary')).toBeVisible();
    await page.waitForTimeout(800);
    for (const label of ['나중에 할게요', '홈에 머물기']) {
      if (await page.getByText(label, { exact: true }).isVisible()) { await page.getByText(label, { exact: true }).click(); await page.waitForTimeout(350); }
    }
  };
  const date = key => page.getByTestId(`learning-calendar-day-${key}`);
  await go();
  const home = page.getByTestId('home-learning-summary'), summary = page.getByTestId('calendar-learning-summary');
  const heading = page.getByTestId('home-study-heading'), progress = page.getByTestId('home-study-progress'), gauge = page.getByTestId('home-study-gauge');
  await expect(heading.getByTestId('home-study-progress')).toHaveText('3/5');
  assert.equal((await gauge.innerText()).trim(), '', 'gauge contains only the progress segments');
  await expect(home).toContainText('3/5'); await expect(home).toContainText('2장'); await expect(home).toContainText('1일');
  await expect(home).not.toContainText('99');
  await expect(summary).toContainText('8일'); await expect(summary).toContainText('1일');
  await expect(date('2026-9-23').getByTestId('learning-partial-day')).toHaveCount(1);
  for (const key of ['2026-9-9', '2026-9-22', '2026-9-24']) {
    await expect(date(key).getByTestId('learning-completed-day')).toHaveCount(0);
    await expect(date(key).getByTestId('learning-partial-day')).toHaveCount(0);
  }
  await expect(date('2026-9-25').getByTestId('learning-review-dot')).toHaveCount(1);
  for (const text of ['오늘 출석 완료!', '오늘 출석 도장 찍기', '한국 시간 기준 · 주말·공휴일에도 복습은 가능해요']) await expect(page.getByText(text, { exact: true })).toHaveCount(0);
  for (const theme of ['light', 'dark']) for (const width of [320, 390]) {
    await page.evaluate(theme => localStorage.setItem('app-settings', JSON.stringify({ state: { themeMode: theme, fontScale: 'xlarge' }, version: 2 })), theme);
    await page.setViewportSize({ width, height: 844 }); await go();
    const grid = page.getByTestId('learning-completion-grid'); await grid.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'small-screen overflow');
    const marker = page.getByTestId('learning-calendar-today');
    await expect(date('2026-9-23').getByTestId('learning-calendar-today')).toHaveText('오늘');
    const markerBox = await marker.boundingBox(), todayBox = await date('2026-9-23').boundingBox();
    assert(markerBox && markerBox.x >= todayBox.x && markerBox.x + markerBox.width <= todayBox.x + todayBox.width, 'today label stays within its date cell');
    await heading.scrollIntoViewIfNeeded();
    const titleBox = await heading.getByText('오늘의 학습', { exact: true }).boundingBox(), progressBox = await progress.boundingBox();
    assert(progressBox.x > titleBox.x && Math.abs(progressBox.y + progressBox.height / 2 - titleBox.y - titleBox.height / 2) < 3, 'progress sits beside the title');
    const segments = await gauge.evaluate(node => [...node.children].map(child => ({ x: child.getBoundingClientRect().x, right: child.getBoundingClientRect().right })));
    const gaugeBox = await gauge.boundingBox();
    assert.equal(segments.length, 5);
    assert(segments[0].x <= gaugeBox.x + 3 && segments.at(-1).right >= gaugeBox.x + gaugeBox.width - 3, 'segments span the full gauge width');
    await page.screenshot({ path: resolve(out, `study-${theme}-${width}.png`) });
    await grid.scrollIntoViewIfNeeded();
    const bounds = await grid.boundingBox();
    for (const path of await page.getByTestId('learning-streak-connection').all()) {
      const box = await path.boundingBox();
      assert(box && box.x >= bounds.x - 4 && box.x + box.width <= bounds.x + bounds.width + 4, 'connector overflow');
    }
    await page.screenshot({ path: resolve(out, `completion-${theme}-${width}.png`), fullPage: true });
    checks.push({ theme, width });
  }
  await date('2026-9-20').click();
  await expect(page.getByText('하루 학습 목표 · 3/5', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '닫기', exact: true }).last().click(); await page.waitForTimeout(300);
  todayDone = 5; await go();
  await expect(progress).toHaveText('5/5');
  assert.equal(await progress.evaluate(node => getComputedStyle(node).color), 'rgb(96, 165, 250)', 'completed count keeps the dark theme blue accent');
  await expect(home).toContainText('5/5'); await expect(home).toContainText('2일');
  await expect(summary).toContainText('9일'); await expect(summary).toContainText('2일');
  await expect(date('2026-9-23').getByTestId('learning-completed-day')).toHaveCount(1);
  for (const [month, expected, day] of [['8월', '1일', '2026-7-3'], ['7월', '1일', '2026-6-31'], ['6월', '0일', null]]) {
    await page.getByRole('button', { name: /2026년 \d+월/, exact: true }).click();
    await page.getByRole('button', { name: month, exact: true }).click();
    await page.getByRole('button', { name: '적용', exact: true }).click();
    await expect(page.getByRole('button', { name: '적용', exact: true })).toBeHidden();
    await expect(summary).toContainText(expected);
    if (day) await expect(date(day).getByTestId('learning-completed-day')).toHaveCount(1);
    await expect(page.getByTestId('learning-streak-connection')).toHaveCount(0); // Friday→Monday keeps its streak without a weekend bridge.
  }
  await page.getByRole('button', { name: '이번 달로 돌아가기', exact: true }).click();
  await page.clock.pauseAt(new Date('2026-10-23T14:59:59Z')); await page.clock.runFor(1000);
  await expect(home).toContainText('쉼');
  await expect(summary).toContainText('2일');
  await expect(date('2026-9-24').getByTestId('learning-completed-day')).toHaveCount(0);
  assert(!writes.includes('/progress/attendance') && !writes.includes('/progress/grade'), 'calendar view must not create attendance or learning');
  assert.deepEqual(errors, []);
  writeFileSync(resolve(out, 'results.json'), JSON.stringify({ checks, errors, writes, note: 'isolated API transport, no production writes' }, null, 2));
  console.log(JSON.stringify({ checks: checks.length + 12, errors, out }));
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
