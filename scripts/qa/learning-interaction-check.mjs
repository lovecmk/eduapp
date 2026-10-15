import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

// Exercise production repositories through isolated HTTP transport, without demo mode.
const bundle = resolve(process.argv[2] ?? 'dist');
const out = resolve(tmpdir(), 'd3m-learning-interactions');
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
const card = { id: 'qa-card', category_cd: 'FIELD', sub_category_nm: '보험·요율', title_txt: '계약 점검', image_url: '1-1', answer_image_url: '1-2', format_nm: '기초용어형', card_type_cd: 'EXPLANATION', question_txt: '조건을 확인했습니까?', answer_txt: 'X', choices: ['O', 'X'], answer_index: 1, principle_txt: '독립된 해설', conclusion_txt: '독립된 해설', improvement_txt: '계약 조건을 확인하세요', note_txt: '예외 조항을 참고하세요', status_cd: 'NEW', difficulty_cd: 'EASY', study_seconds: 30, due_at: null };
const deck = [card, { ...card, id: 'qa-card-2', title_txt: '두 번째 점검' }, { ...card, id: 'qa-card-3', title_txt: '세 번째 점검' }];
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
  await front.waitFor();
  await face(false);
  await openImage('계약 점검');
  await viewer.click({ position: { x: 195, y: 400 } });
  await viewer.waitFor({ state: 'hidden' });
  await face(false);
  await openImage('계약 점검');
  await viewer.click({ position: { x: 8, y: 8 } });
  await viewer.waitFor({ state: 'hidden' });
  await face(false);
  await openImage('계약 점검');
  const area = await viewer.boundingBox();
  await page.mouse.move(area.x + 120, area.y + 220);
  await page.mouse.down();
  await page.mouse.move(area.x + 200, area.y + 290, { steps: 8 });
  await page.mouse.up();
  assert(await viewer.isVisible(), 'Pan dismissed image');
  await viewer.click({ position: { x: 195, y: 400 } });
  await viewer.waitFor({ state: 'hidden' });
  await face(false);
  await openImage('계약 점검');
  await page.getByLabel('확대 보기 닫기').click();
  await viewer.waitFor({ state: 'hidden' });
  checks.push({ case: 'image/backdrop tap, pan rejection, close button' });

  const cardBox = await front.boundingBox();
  for (const count of [2, 3, 5]) {
    for (let i = 0; i < count; i++) {
      await page.mouse.click(cardBox.x + 30, cardBox.y + 35);
      await page.waitForTimeout(60);
    }
    await face(count === 3);
  }
  // Starting front: 2 -> front, 3 -> back, 5 -> front.
  await page.getByRole('button', { name: '카드 뒤집기', exact: true }).click();
  await face(true);
  await openImage('계약 점검 해설 사진');
  await viewer.click({ position: { x: 195, y: 400 } });
  await viewer.waitFor({ state: 'hidden' });
  await face(true);
  await back.click({ position: { x: 4, y: 4 } });
  await face(false);
  checks.push({ case: 'rapid taps, back empty-space tap, image does not flip' });

  for (let i = 0; i < 3; i++) {
    await face(false);
    await page.getByRole('button', { name: '카드 뒤집기', exact: true }).click();
    await page.waitForTimeout(450);
    await page.getByText('알고 있었어요', { exact: true }).click();
    await page.getByLabel('난이도 쉬움 — 바로 알았어요').click();
    await page.waitForTimeout(450);
  }
  checks.push({ case: 'three-card allocation and flip reset between cards' });
  await page.getByText('학습 완료!', { exact: true }).waitFor();
  await page.getByText('복습하러 가기', { exact: true }).click();
  await page.waitForTimeout(450);
  assert.equal(new URL(page.url()).pathname, '/eduapp/review');
  assert.equal(await page.getByRole('tab').count(), 5);
  await expect(reviewTab).toHaveAttribute('aria-selected', 'true');
  const destination = new URL(page.url()).pathname;
  await page.getByRole('tab').filter({ hasText: 'MY' }).click();
  await reviewTab.click();
  assert.equal(new URL(page.url()).pathname, destination);
  await page.screenshot({ path: resolve(out, 'review-tab.png') });
  checks.push({ case: 'completion review path equals tab path, tab bar and active state retained' });
  assert.equal(errors.length, 0, JSON.stringify(errors));
  writeFileSync(resolve(out, 'learning-results.json'), JSON.stringify({ checks, errors, requests: requests.length, note: 'Isolated HTTP; no production writes.' }, null, 2) + '\n');
  console.log(JSON.stringify({ checks: checks.length, errors, out }));
} catch (error) {
  await page.screenshot({ path: resolve(out, 'failure.png'), fullPage: true });
  console.error(await page.locator('body').innerText());
  console.error(JSON.stringify({ errors, url: page.url() }));
  throw error;
} finally { await browser.close(); await new Promise(done => server.close(done)); }
