import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const bundle = resolve(process.argv[2] ?? 'dist');
const out = resolve(tmpdir(), 'haru-new-first-calendar-qa');
mkdirSync(out, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf' };
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
const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge' } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const user = { id: 'order-qa', user_nm: '점검 사용자', nickname: 'QA', role_cd: 'USER', membership_cd: 'BASIC', status_cd: 'A' };
  await context.addInitScript(user => {
    localStorage.setItem('accessToken', 'isolated-order'); localStorage.setItem('refreshToken', 'isolated-order');
    localStorage.setItem('cachedUser', JSON.stringify(user)); localStorage.setItem('session-owner-id', user.id);
    localStorage.setItem('faction', JSON.stringify({ state: { faction: 'frost' }, version: 0 }));
    localStorage.setItem(`daily-learning-welcome:v1:${encodeURIComponent(user.id)}`, JSON.stringify({ day: '2026-10-26', quoteIndex: 0 }));
  }, user);
  const base = { category_cd: 'ELEC', format_nm: '상황형', card_type_cd: 'EXPLANATION', difficulty_cd: 'EASY', study_seconds: 30, principle_txt: '안전 원칙을 확인합니다.', answer_txt: '안전 조치', due_at: null };
  const fresh = Array.from({ length: 3 }, (_, i) => ({ ...base, id: `new-${i}`, status_cd: 'NEW', title_txt: `신규 ${i + 1}`, question_txt: `신규 ${i + 1}번 문제` }));
  const backlog = Array.from({ length: 10 }, (_, i) => ({ ...base, id: `review-${i}`, status_cd: 'LEARNING', title_txt: `복습 ${i + 1}`, question_txt: `복습 ${i + 1}번 문제`, due_at: '2026-10-23T00:00:00+09:00' }));
  const selected = [backlog[8], backlog[9]];
  const deck = [...selected.map(card => ({ ...card, kind: 'REVIEW' })), ...fresh.map(card => ({ ...card, kind: 'NEW' }))]; // Older server order.
  const completed = new Set(), errors = [];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/inner/api/v1/')) { assert.equal(url.origin, origin); return route.continue(); }
    const path = url.pathname.slice('/inner/api/v1'.length);
    let body = {};
    if (path === '/auth/me') body = user;
    else if (path === '/cards') body = [...fresh, ...backlog];
    else if (path === '/learning/today') body = { day: '2026-9-26', cards: deck.map(card => ({ ...card, done: completed.has(card.id) })), target_count: 5, done_count: completed.size, difficulty_cd: 'EASY' };
    else if (path === '/learning/quota') body = { limit: 3, used: 0 };
    else if (path === '/progress') body = { cards: Object.fromEntries(backlog.map(card => [card.id, { box: 0, reps: 1, last_grade: 'again', due_at: card.due_at, last_reviewed_at: '2026-10-20T03:00:00Z' }])), history: {}, attendance: {} };
    else if (path === '/progress/grade') completed.add(route.request().postDataJSON().card_id);
    else if (/^\/cards\/[^/]+\/edit$/.test(path)) body = { ...deck.find(card => path.includes(`/${card.id}/`)), status_cd: route.request().postDataJSON().status_cd };
    else if (path.endsWith('/difficulty')) body = { mine: null, easy: 0, normal: 0, hard: 0 };
    else if (path === '/stats') body = { total_learned: 0, total_cards: 13, weekly: [], category_breakdown: [], rankings: [] };
    else if (path === '/engagement') body = { liked_ids: [], bookmarked_ids: [] };
    else if (path === '/community/live') body = { online_now: 0, studied_today: 0, leaderboard: [], companions: [], activities: [] };
    else if (/\/(feed|qna|notifications|tips|users|support)$/.test(path)) body = [];
    await route.fulfill({ status: 200, json: body });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date('2026-10-26T03:00:00Z') });
  await page.goto(origin + '/eduapp/');
  const today = page.getByTestId('learning-calendar-day-2026-9-26');
  for (const theme of ['light', 'dark']) for (const width of [320, 390]) {
    await page.evaluate(theme => localStorage.setItem('app-settings', JSON.stringify({ state: { themeMode: theme, fontScale: 'xlarge' }, version: 2 })), theme);
    await page.setViewportSize({ width, height: 844 });
    await page.reload();
    await expect(today).toHaveAttribute('aria-label', /복습 일정 2장/);
    await today.click();
    await expect(page.getByText('오늘 복습 일정 2', { exact: true })).toBeVisible();
    for (const card of selected) await expect(page.getByText(card.question_txt, { exact: true })).toBeVisible();
    for (const card of backlog.slice(0, 8)) await expect(page.getByText(card.question_txt, { exact: true })).toHaveCount(0);
    await page.waitForTimeout(450);
    await page.screenshot({ path: resolve(out, `actual-two-${theme}-${width}.png`) });
    await page.getByRole('button', { name: '닫기', exact: true }).last().click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab').filter({ hasText: '학습' }).click();
  const front = page.getByTestId('learning-card-front');
  for (const card of [...fresh, ...selected]) {
    await expect(front).toContainText(card.question_txt);
    await page.getByRole('button', { name: '카드 뒤집기', exact: true }).click();
    await page.waitForTimeout(450);
    await page.getByText('알고 있어요', { exact: true }).click();
    if (card.id.startsWith('new-')) await page.getByLabel('난이도 쉬움 — 바로 알았어요').click();
    await page.waitForTimeout(500);
  }
  await page.goto(origin + '/eduapp/');
  await expect(today).toHaveAttribute('aria-label', /복습 일정 0장/);
  await today.click();
  await expect(page.getByText('오늘 복습 일정 0', { exact: true })).toBeVisible();
  await expect(page.getByText('예정된 복습 카드가 없어요', { exact: true })).toBeVisible();
  assert.equal(completed.size, 5);
  assert.deepEqual(errors, []);
  console.log('PASS: ten-card backlog shows only the two actual assigned reviews; light/dark 320/390px; older server order becomes three new then two reviews; completed reviews disappear without replacement.');
} finally { await browser.close(); await new Promise(done => server.close(done)); }
