import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

// Exercise production repositories through isolated HTTP transport, without demo mode.
const bundle = resolve(process.argv[2] ?? 'dist');
const out = resolve(tmpdir(), 'd3m-single-choice');
mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.woff': 'font/woff' };
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/eduapp(?=\/|$)/, '');
  let file = resolve(bundle, '.' + path);
  if (!file.startsWith(bundle + '/') && !file.startsWith(bundle + '\\') && file !== bundle) { response.writeHead(403).end(); return; }
  if (!existsSync(file) || !extname(file) || statSync(file).isDirectory()) file = resolve(bundle, 'index.html');
  response.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
  response.end(readFileSync(file));
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge' } : {});
const errors = [], checks = [], requests = [];
const user = { id: 'qa-isolated-ui', user_nm: '점검 사용자', nickname: 'QA', email_addr: 'qa@example.test', membership_cd: 'BASIC', role_cd: 'USER', status_cd: 'A', created_at: '2026-10-01T00:00:00Z' };
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.addInitScript(user => {
  localStorage.setItem('accessToken', 'isolated-ui-access');
  localStorage.setItem('refreshToken', 'isolated-ui-refresh');
  localStorage.setItem('cachedUser', JSON.stringify(user));
  localStorage.setItem('session-owner-id', user.id);
  localStorage.setItem('faction', JSON.stringify({ state: { faction: 'frost' }, version: 0 }));
}, user);
let mode = 'one';
const card = { id: 'qa-card', category_cd: 'ELEC', format_nm: '현장판단형', card_type_cd: 'CHOICE', situation_txt: '현장 상태를 확인합니다.', title_txt: '현장 판단 시험', question_txt: '적절한 조치는?', choices: ['첫 보기', '정답 보기', '셋째 보기'], answer_index: 1, answer_txt: '정답 보기', principle_txt: '판단 근거입니다.', status_cd: 'NEW', difficulty_cd: 'EASY', study_seconds: 30, due_at: null };
const deck = [card, { ...card, id: 'qa-card-2', format_nm: '선택비교형', title_txt: '설명 비교 시험', choices: ['첫 보기', '정답 보기'] }, { ...card, id: 'qa-card-3', format_nm: '기초용어형', card_type_cd: 'EXPLANATION', choices: undefined, answer_index: undefined }];
await context.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (!url.pathname.startsWith('/inner/api/v1/')) {
    assert.equal(url.origin, origin, 'Unexpected external request');
    return route.continue();
  }
  const path = url.pathname.slice('/inner/api/v1'.length);
  requests.push({ method: route.request().method(), path });
  let status = 200, body = {};
  if (path === '/auth/me') { status = mode === 'expired' ? 401 : 200; body = user; }
  else if (path === '/auth/refresh') { status = 401; body = { message: 'expired' }; }
  else if (path === '/cards') { status = mode === 'error' ? 503 : 200; body = mode === 'one' ? deck : []; }
  else if (/^\/cards\/qa-card(?:-\d)?\/edit$/.test(path)) body = { ...deck.find(card => path.includes(card.id + '/edit')), status_cd: route.request().postDataJSON().status_cd };
  else if (path === '/learning/today') body = { cards: deck.map(card => ({ ...card, kind: 'NEW', done: false })), target_count: 3, done_count: 0, difficulty_cd: 'EASY' };
  else if (path === '/stats') body = { streak_days: 0, best_streak: 0, total_learned: 0, total_cards: 0, accuracy_rate: 0, due_today: 0, weekly: [], category_breakdown: [], rankings: [] };
  else if (path === '/community/live') body = { online_now: 0, studied_today: 0, total_minutes_today: 0, daily_goal_minutes: 3, companions: [], activities: [], leaderboard: [], building: { floor_size: 20000, current: { month: '2026-10', label: '10월', problems: 0, floors: 0, winner: '' }, history: [] } };
  else if (path === '/learning/quota') body = { limit: 3, used: 0, resets_at: '2026-10-15T00:00:00+09:00' };
  else if (path === '/rooftop') body = { month: '2026-10', floors: 0, my_bricks: 0, history: [] };
  else if (/\/(feed|qna|notifications|users|tips|support)$/.test(path) || path.endsWith('/tips')) body = [];
  else if (path === '/weather/current') body = { condition: 'clear', observed_at: '2026-10-14T00:00:00Z' };
  else if (path.endsWith('/difficulty-poll')) body = { mine: null, counts: null };
  else if (path === '/health') body = { status: 'ok', version: 'isolated-test', store: 'test' };
  if (path === '/cards' && mode === 'loading') await new Promise(done => setTimeout(done, 700));
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
async function go(path, width = 390) {
  await page.setViewportSize({ width, height: 844 });
  await page.goto(origin + '/eduapp' + path);
  await page.waitForTimeout(1300);
  assert(!await page.getByText('Unmatched Route', { exact: true }).count(), 'Unmatched route ' + path);
  assert((await page.locator('body').innerText()).trim(), 'Empty screen ' + path);
  assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), 'Overflow ' + path);
  checks.push({ path, width, mode });
}
const front = page.getByTestId('learning-card-front');
const back = page.getByTestId('learning-card-back');
const viewer = page.getByTestId('image-viewer-surface');
const reviewTab = page.getByRole('tab').filter({ hasText: '복습' });
async function face(isBack) {
  await page.waitForTimeout(450);
  assert.equal(await (isBack ? back : front).evaluate(node => getComputedStyle(node).pointerEvents), 'auto');
  assert.equal(await (isBack ? back : front).evaluate(node => Number(getComputedStyle(node).opacity)), 1);
}
async function openImage(alt) {
  await page.getByRole('button', { name: alt + ' 크게 보기', exact: true }).click();
  await viewer.waitFor();
}
try {
  await go('/');
  if (await page.getByText('나중에 할게요', { exact: true }).isVisible()) await page.getByText('나중에 할게요', { exact: true }).click();
  await page.getByRole('tab').filter({ hasText: '학습' }).click();
  for (const [i, format] of ['현장판단형', '선택비교형'].entries()) {
    await front.waitFor(); await face(false);
    await expect(front).toContainText(format);
    const option = i === 0 ? '첫 보기' : '정답 보기';
    await front.getByText(option, { exact: true }).click();
    await expect(front).toContainText(i === 0 ? '아쉬워요 — 정답은 ②' : '정답이에요!');
    await face(false);
    for (const label of deck[i].choices) await expect(front.getByRole('button').filter({ hasText: label }).first()).toBeDisabled();
    assert.equal(await page.getByRole('tab').count(), 5, 'bottom tabs retained');
    await page.setViewportSize({ width: 320, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: resolve(out, i + '-320.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: '카드 뒤집기', exact: true }).click(); await face(true);
    await page.getByText('알고 있어요', { exact: true }).click();
    await page.getByLabel('난이도 쉬움 — 바로 알았어요').click();
    await page.waitForTimeout(500);
    checks.push({ format, grade: i === 0 ? 'incorrect' : 'correct', locked: true });
  }
  await face(false);
  await expect(front).toContainText('3/3');
  await expect(front.getByText('정답 보기', { exact: true })).toHaveCount(0);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  writeFileSync(resolve(out, 'results.json'), JSON.stringify({ checks, errors, requests, environment: 'isolated HTTP; no production writes' }, null, 2));
  console.log('PASS: both formats in real learning flow, correct/incorrect selection, lock, back face, next-card reset, 320px and bottom tabs');
} catch (error) {
  await page.screenshot({ path: resolve(out, 'failure.png'), fullPage: true });
  console.error(await page.locator('body').innerText()); throw error;
} finally { await browser.close(); await new Promise(done => server.close(done)); }
