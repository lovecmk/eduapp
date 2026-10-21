import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

// Exercise production repositories through isolated HTTP transport, without demo mode.
const bundle = resolve(process.argv[2] ?? 'dist');
const out = resolve(tmpdir(), 'd3m-live-ui-audit');
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
let mode = 'empty';
const card = { id: 'qa-card', category_cd: 'FIELD', sub_category_nm: '보험·요율', title_txt: '계약 점검', format_nm: 'OX형', card_type_cd: 'OX', question_txt: '조건을 확인했습니까?', answer_txt: 'X', choices: ['O', 'X'], answer_index: 1, principle_txt: '독립된 해설', conclusion_txt: '독립된 해설', improvement_txt: '계약 조건을 확인하세요', note_txt: '예외 조항을 참고하세요', status_cd: 'NEW', difficulty_cd: 'EASY', study_seconds: 30, due_at: null };
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
  else if (path === '/cards') { status = mode === 'error' ? 503 : 200; body = mode === 'one' ? [card] : []; }
  else if (path === '/learning/today') body = { cards: [], target_count: 0, done_count: 0, difficulty_cd: 'EASY' };
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
  const bar = page.getByTestId('app-tab-bar');
  if (mode === 'expired') assert.equal(await bar.count(), 0, 'Signed-out tab bar visible');
  else {
    assert.equal(await bar.count(), 1, 'Missing or duplicated tab bar on ' + path);
    assert(await bar.isVisible(), 'Hidden tab bar on ' + path);
    assert.equal(await bar.getByRole('tab').count(), 5);
    const bounds = await bar.boundingBox();
    assert(bounds && Math.abs(bounds.y + bounds.height - 844) < 2, 'Tab bar outside viewport on ' + path);
  }
  checks.push({ path, width, mode });
}
try {
  for (const path of ['/', '/cards', '/community', '/saved', '/notifications', '/settings', '/contents', '/profile', '/legal', '/qna/not-found', '/support', '/admin', '/quiz-examples']) await go(path);
  for (const path of ['/cards', '/community', '/settings', '/contents', '/quiz-examples']) await go(path, 320);
  await go('/settings');
  await page.getByText('문제 유형 예시', { exact: true }).click();
  await page.waitForURL(/\/quiz-examples(?:\?|$)/);
  const player = page.getByTestId('quiz-example-player');
  const exampleSubmit = () => player.getByRole('button', { name: '정답 확인', exact: true });
  const examplePick = name => player.getByRole('button', { name, exact: true }).click();
  const exampleType = name => page.getByRole('button', { name, exact: true }).click();
  const exampleReset = () => examplePick('처음부터 풀기');
  await expect(exampleSubmit()).toBeDisabled();
  const checkbox = name => player.getByRole('checkbox', { name, exact: true });
  for (const name of ['가연물', '산소']) await checkbox(name).click();
  await exampleSubmit().click();
  await expect(player.getByTestId('quiz-example-feedback')).toContainText('다시 확인해 보세요.');
  await expect(checkbox('점화원')).toBeDisabled();
  await exampleReset();
  for (const name of ['점화원', '산소', '가연물']) await checkbox(name).click();
  await exampleSubmit().click();
  await expect(player.getByTestId('quiz-example-feedback')).toContainText('정답입니다!');
  await page.screenshot({ path: resolve(out, 'example-multiple.png'), fullPage: true });
  await exampleType('순서맞추기');
  await examplePick('보고서 저장');
  await expect(exampleSubmit()).toBeDisabled();
  await examplePick('1번 보고서 저장 선택 취소');
  for (const name of ['점검 결과 입력', '입력 내용 확인', '보고서 저장']) await examplePick(name);
  await exampleSubmit().click();
  await expect(player.getByTestId('quiz-example-feedback')).toContainText('정답입니다!');
  await page.screenshot({ path: resolve(out, 'example-ordering.png'), fullPage: true });
  await exampleType('연결하기');
  for (const name of ['발화에 필요한 에너지', '연소할 수 있는 물질', '연소를 돕는 기체']) await examplePick(name);
  await exampleSubmit().click();
  await expect(player.getByTestId('quiz-example-feedback')).toContainText('다시 확인해 보세요.');
  await exampleReset();
  await examplePick('연소할 수 있는 물질');
  await examplePick('연소할 수 있는 물질');
  await expect(player.getByText('1 / 3쌍 연결')).toBeVisible();
  await expect(exampleSubmit()).toBeDisabled();
  await examplePick('가연물');
  for (const name of ['연소할 수 있는 물질', '연소를 돕는 기체', '발화에 필요한 에너지']) await examplePick(name);
  await exampleSubmit().click();
  await expect(player.getByTestId('quiz-example-feedback')).toContainText('정답입니다!');
  await page.setViewportSize({ width: 320, height: 844 });
  assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), 'Example overflow at 320px');
  await expect(page.getByTestId('app-tab-bar')).toBeVisible();
  await page.screenshot({ path: resolve(out, 'example-matching-narrow.png'), fullPage: true });
  await exampleType('복수정답');
  await expect(exampleSubmit()).toBeDisabled();
  await expect(player.getByRole('checkbox', { checked: true })).toHaveCount(0);
  checks.push({ action: 'examples-exact-grading-reset-lock-completeness-pair-replacement-type-reset' });
  await go('/settings');
  await page.getByTestId('app-tab-bar').getByRole('tab', { name: '학습', exact: true }).click();
  await page.waitForURL('**/cards');
  assert.equal(await page.getByTestId('app-tab-bar').count(), 1);
  checks.push({ action: 'settings-to-learning-tab' });
  mode = 'loading'; await go('/cards');
  mode = 'error'; await go('/cards');
  assert(!await page.getByText('계약 점검', { exact: true }).count(), 'Failure fabricated cards');
  mode = 'one'; await go('/content/qa-card');
  assert((await page.locator('body').innerText()).includes('조건을 확인했습니까?'), 'Live card missing');
  const unexpectedWrites = requests.filter(r => r.method !== 'GET' && !['/collection/sync', '/progress/attendance', '/notifications/device', '/auth/logout', '/settings', '/me/faction'].includes(r.path));
  assert.equal(unexpectedWrites.length, 0, JSON.stringify(unexpectedWrites));
  mode = 'expired'; await go('/settings');
  assert(await page.getByRole('button', { name: '로그인', exact: true }).count(), 'Expired session was resurrected');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  assert(await page.getByText('아이디와 비밀번호를 모두 입력해주세요', { exact: true }).isVisible());
  assert.equal(errors.length, 0, JSON.stringify(errors));
  writeFileSync(resolve(out, 'results.json'), JSON.stringify({ checks, runtimeErrors: errors, requests: requests.length, note: 'Production repositories; isolated HTTP responses; no production writes.' }, null, 2) + '\n');
  await page.screenshot({ path: resolve(out, 'login.png') });
  console.log(JSON.stringify({ checks: checks.length, runtimeErrors: errors.length, requests: requests.length, out }));
} catch (error) {
  await page.screenshot({ path: resolve(out, 'failure.png'), fullPage: true });
  console.error(await page.locator('body').innerText());
  console.error(JSON.stringify({ errors, requests: requests.slice(-15), url: page.url() }));
  throw error;
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
