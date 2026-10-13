import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

// 준비: EXPO_NO_DOTENV=1 EXPO_PUBLIC_USE_MOCK_DATA=true npx expo export --clear --platform web --output-dir <번들 경로>
const bundle = resolve(process.argv[2] ?? resolve(tmpdir(), 'field-ui-audit/mock'));
const out = resolve('docs/qa/ui-audit');
mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.woff': 'font/woff' };
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/eduapp(?=\/|$)/, '');
  let file = resolve(bundle, '.' + path);
  if (!file.startsWith(bundle + '/') && !file.startsWith(bundle + '\\') && file !== bundle) { response.writeHead(403).end(); return; }
  if (!existsSync(file) || !extname(file)) file = resolve(bundle, 'index.html');
  response.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
  response.end(readFileSync(file));
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge' } : {});
const errors = [], warnings = [], checks = [];
function track(page) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
    if (message.type() === 'warning') warnings.push(message.text());
  });
}
const user = { id: 'qa-user', name: '점검 사용자', nickname: 'QA', email: 'qa@example.test', membership: 'basic', isAdmin: false, isActive: true, createdAt: '2026-10-01T00:00:00.000Z' };
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.addInitScript((user) => {
  // Account/logout routes clear auth; each navigation starts an independent signed-in case.
  localStorage.setItem('accessToken', 'mock-access-token');
  localStorage.setItem('refreshToken', 'mock-refresh-token');
  localStorage.setItem('mockUser', JSON.stringify(user));
  localStorage.setItem('session-owner-id', user.id);
  localStorage.setItem('faction', JSON.stringify({ state: { faction: 'frost' }, version: 0 }));
}, user);
await context.route('**/*', (route) => {
  if (!route.request().url().startsWith(origin)) { errors.push('Unexpected external request'); return route.abort(); }
  return route.continue();
});
const page = await context.newPage();
track(page);
const go = async (path) => {
  await page.goto(origin + '/eduapp' + path);
  await page.waitForTimeout(1100);
  assert(!await page.getByText('Unmatched Route', { exact: true }).count(), `Unmatched route: ${path}`);
  assert(await page.locator('body').innerText(), `Empty screen: ${path}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  assert(!overflow, `Horizontal overflow: ${path}`);
  checks.push({ path, width: (await page.viewportSize()).width });
};
try {
  const inventory = JSON.parse(readFileSync(resolve(out, 'inventory.json'), 'utf8'));
  for (const entry of process.env.QA_QUICK ? [] : inventory.files.filter((entry) => entry.page)) {
    const path = '/' + entry.file.slice(4).replace(/\.tsx$/, '').replace(/\([^/]+\)\//g, '').replace(/\/index$/, '').replace(/^index$/, '');
    const sample = path.replace('[id]', path.startsWith('/content') ? 'lc001' : path.startsWith('/qna') ? 'not-found' : 'qa-user').replace('[type]', 'today');
    await go(sample);
  }
  for (const [path, name] of process.env.QA_QUICK ? [] : [['/', 'home'], ['/cards', 'study'], ['/community', 'community'], ['/settings', 'settings'], ['/content/lc001', 'content']]) {
    await go(path);
    if (name === 'community') {
      await page.getByText('함께 짓는 안전 빌딩', { exact: true }).waitFor();
      const preparing = page.getByText(/진영별 기여 집계를 준비하고 있어요/);
      if (await preparing.count()) {
        assert.equal(await page.getByText('기여 문제', { exact: true }).count(), 0, 'Unavailable aggregates must not fabricate faction metrics');
      } else {
        assert.equal(await page.getByText('기여 문제', { exact: true }).count(), 3, 'Available aggregates show all three faction metrics');
      }
      await page.getByText('함께 짓는 안전 빌딩', { exact: true }).scrollIntoViewIfNeeded();
    }
    await page.screenshot({ path: resolve(out, name + '.png') });
  }
  await go('/content/lc001');
  const save = page.getByRole('button', { name: '이 카드 저장', exact: true });
  if (await save.count()) await save.click();
  await go('/saved');
  assert((await page.locator('body').innerText()).includes('절연'), 'Saved card missing');
  await go('/support');
  await page.getByRole('button', { name: '운영진에게 문의하기', exact: true }).click();
  assert(await page.getByText('고객센터 문의', { exact: true }).isVisible());
  await page.getByRole('dialog').waitFor();
  await page.waitForTimeout(100);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  assert(!await page.getByText('고객센터 문의', { exact: true }).isVisible());
  await page.getByRole('button', { name: '운영진에게 문의하기', exact: true }).click();
  await page.getByRole('button', { name: '닫기', exact: true }).last().click();
  await page.waitForTimeout(300);
  assert(!await page.getByText('고객센터 문의', { exact: true }).isVisible());
  await page.getByRole('button', { name: '운영진에게 문의하기', exact: true }).click();
  await page.mouse.click(5, 5);
  await page.waitForTimeout(300);
  assert(!await page.getByText('고객센터 문의', { exact: true }).isVisible());
  checks.push({ interaction: 'support modal X/Escape/overlay' });
  for (const path of ['/settings', '/cards', '/community', '/content/lc001']) {
    await page.setViewportSize({ width: 320, height: 740 });
    await go(path);
  }
  const loggedOut = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const anonymous = await loggedOut.newPage();
  track(anonymous);
  await anonymous.goto(origin + '/eduapp/settings');
  await anonymous.getByRole('button', { name: '로그인', exact: true }).waitFor();
  await anonymous.getByRole('button', { name: '로그인', exact: true }).click();
  assert(await anonymous.getByText('아이디와 비밀번호를 모두 입력해주세요', { exact: true }).isVisible());
  checks.push({ interaction: 'signed-out deep link + login validation' });
  await loggedOut.close();
  assert.equal(errors.length, 0, JSON.stringify(errors));
  // RN-web의 JS 애니메이션 폴백은 정상 안내이며 라우터/React 경고는 실패로 처리한다.
  const unexpectedWarnings = warnings.filter((warning) => !warning.includes('useNativeDriver'));
  assert.equal(unexpectedWarnings.length, 0, JSON.stringify(unexpectedWarnings));
  writeFileSync(resolve(out, 'results.json'), JSON.stringify({ checks, runtimeErrors: errors, unexpectedWarnings, note: 'Mock repositories; no production requests or real-device APIs' }, null, 2) + '\n');
  console.log(JSON.stringify({ checks: checks.length, runtimeErrors: errors.length, unexpectedWarnings: unexpectedWarnings.length }));
} catch (error) {
  await page.screenshot({ path: resolve(tmpdir(), 'd3m-app-ui-failure.png'), fullPage: true });
  console.error(await page.locator('body').innerText());
  console.error(JSON.stringify({ errors, warnings, url: page.url() }));
  throw error;
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
