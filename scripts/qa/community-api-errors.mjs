import { createServer } from 'node:http';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
// Export with EXPO_NO_DOTENV=1, mock=false and API=https://qa.invalid.
// Every API/external request is intercepted; no production account or server is used.
const bundle = resolve(process.argv[2] ?? '.audit.local/api-export');
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname.replace(/^\/eduapp(?=\/|$)/, '');
  let file = resolve(bundle, '.' + path);
  if (!file.startsWith(bundle + '/') && !file.startsWith(bundle + '\\') && file !== bundle) return res.writeHead(403).end();
  if (!existsSync(file) || !extname(file)) file = resolve(bundle, 'index.html');
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.otf': 'font/otf' })[extname(file)] ?? 'application/octet-stream');
  res.end(readFileSync(file));
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge' } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => {
  localStorage.setItem('accessToken', 'isolated-ui-test');
  localStorage.setItem('refreshToken', 'isolated-ui-test');
  localStorage.setItem('session-owner-id', '900001');
  localStorage.setItem('faction', JSON.stringify({ state: { faction: 'frost' }, version: 0 }));
});
const paths = []; const errors = [];
let fail = true;
let queries = 0;
await ctx.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.origin === origin && !url.pathname.startsWith('/inner/api/')) return route.continue();
  paths.push(url.pathname);
  let status = 200;
  let dto = {};
  if (url.pathname === '/inner/api/v1/auth/me') dto = { id: 900001, user_nm: 'QA', email_addr: 'qa@example.test', status_cd: 'A', membership_cd: 'BASIC', role_cd: 'USER', created_at: '2026-10-01T00:00:00Z' };
  else if (url.pathname === '/inner/api/v1/me/faction') dto = { faction_cd: 'frost' };
  else if (url.pathname === '/inner/api/v1/community/live') {
    queries++;
    status = fail ? 500 : 200;
    dto = fail ? { message: 'isolated failure' } : { building: { floor_size: 20000, current: { month: '2026-10', label: '10월', problems: 0, floors: 0, winner: '', factions: ['frost', 'flame', 'volt'].map((id) => ({ faction_cd: id, problems: 0 })) }, history: [] }, companions: [], activities: [], leaderboard: [] };
  } else if (url.pathname === '/inner/api/v1/community/rooftop') { status = 503; dto = { message: 'isolated undeployed endpoint' }; }
  else if (url.pathname.includes('/cards') || url.pathname.includes('/questions')) dto = [];
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(dto) });
});
try {
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/eduapp/community');
  const retry = page.getByText('진영 현황 다시 불러오기', { exact: true });
  await retry.waitFor({ timeout: 25000 });
  assert(queries > 0);
  await retry.scrollIntoViewIfNeeded();
  fail = false;
  await retry.click();
  await page.getByText('기여 문제', { exact: true }).first().waitFor({ timeout: 20000 });
  assert.equal(await page.getByText('기여 문제', { exact: true }).count(), 3);
  await page.getByText('보물상자 다시 확인', { exact: true }).waitFor({ timeout: 20000 });
  mkdirSync('.audit.local/community-api-ui', { recursive: true });
  await page.screenshot({ path: '.audit.local/community-api-ui/recovered.png' });
  console.log(JSON.stringify({ apiErrorRetry: true, recoveredFactions: 3, rooftopUndeployedFailClosed: true, fixtureRequestsOnly: true, communityQueries: queries }));
} catch (error) {
  const pages=ctx.pages();
  if(pages[0]) console.log(JSON.stringify({path:new URL(pages[0].url()).pathname,body:(await pages[0].locator('body').innerText()).slice(0,700),queries,paths,errors}));
  throw error;
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
