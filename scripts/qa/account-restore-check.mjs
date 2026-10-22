import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const bundle = resolve(process.argv[2] ?? 'dist');
const out = resolve(tmpdir(), 'haru-account-reinstall-qa');
mkdirSync(out, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.otf': 'font/otf', '.ttf': 'font/ttf' };
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/eduapp(?=\/|$)/, '');
  let file = resolve(bundle, '.' + pathname);
  if (!file.startsWith(bundle + '/') && !file.startsWith(bundle + '\\') && file !== bundle) { response.writeHead(403).end(); return; }
  if (!existsSync(file) || !extname(file) || statSync(file).isDirectory()) file = resolve(bundle, 'index.html');
  response.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream'); response.end(readFileSync(file));
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = 'http://127.0.0.1:' + server.address().port;
const user = { id: 'reinstall-qa', user_nm: '복원 점검', nickname: 'QA', role_cd: 'USER', membership_cd: 'BASIC', status_cd: 'A' };
const card = { id: 'restored-card', category_cd: 'ELEC', title_txt: '복원된 카드', question_txt: '안전 수칙을 확인합니다.', status_cd: 'LEARNING', difficulty_cd: 'EASY', card_type_cd: 'OX', format_nm: 'OX형', answer_txt: 'O', choices: ['O', 'X'], answer_index: 0, principle_txt: '안전 수칙' };
const progress = { cards: { [card.id]: { box: 2, reps: 3, lapses: 1, last_grade: 'good', last_reviewed_at: '2026-10-22T03:00:00Z', due_at: '2026-10-24T03:00:00Z' } }, history: { '2026-9-22': [card.id] }, attendance: { '2026-9-22': '2026-10-22T03:00:00Z' }, daily_goals: { '2026-9-22': { target_count: 1, card_ids: [card.id] } } };
const collection = { owned: { saved: 3 }, packs_earned: 20, packs_opened: 4, shards_earned: 100, shards_spent: 10, study_total: 32, claimed_rules: {}, redeemed_codes: [], last_daily_pack: '', since_epic: 0, since_legendary: 0 };
const errors = [], results = [];
const sha = value => createHash('sha256').update(value).digest('hex');
let browser;
try {
  browser = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge' } : {});
  for (const scenario of ['reinstall-delayed', 'incorrect-local-choice', 'lookup-failed', 'conflict']) {
    const context = await browser.newContext({ viewport: { width: scenario === 'lookup-failed' ? 320 : 390, height: 844 } });
    await context.addInitScript(({ user, scenario }) => {
      localStorage.setItem('accessToken', 'isolated-reinstall'); localStorage.setItem('refreshToken', 'isolated-reinstall');
      localStorage.setItem('cachedUser', JSON.stringify(user)); localStorage.setItem('session-owner-id', user.id);
      localStorage.setItem(`daily-learning-welcome:v1:${encodeURIComponent(user.id)}`, JSON.stringify({ days: ['2026-10-23'], day: '2026-10-23', quoteIndex: 0 }));
      if (scenario === 'incorrect-local-choice') localStorage.setItem('faction', JSON.stringify({ state: { faction: 'flame' }, version: 0 }));
    }, { user, scenario });
    let failed = scenario === 'lookup-failed', serverFaction = scenario === 'conflict' ? null : 'frost';
    const writes = [];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (!url.pathname.startsWith('/inner/api/v1/')) { assert.equal(url.origin, origin); return route.continue(); }
      const path = url.pathname.slice('/inner/api/v1'.length), method = route.request().method();
      if (method !== 'GET') writes.push({ path, body: route.request().postDataJSON() });
      let body = {};
      if (path === '/auth/me') body = user;
      else if (path === '/me/faction') {
        if (method === 'POST') { serverFaction = 'frost'; return route.fulfill({ status: 409, json: { message: '이미 선택한 진영은 변경할 수 없습니다' } }); }
        if (scenario === 'reinstall-delayed') await new Promise(done => setTimeout(done, 1200));
        if (failed) return route.fulfill({ status: 503, json: { message: 'temporary failure' } });
        body = { faction_cd: serverFaction };
      } else if (path === '/cards') body = [card];
      else if (path === '/progress') body = progress;
      else if (path === '/collection' || path === '/collection/sync') body = collection;
      else if (path === '/settings') body = { bio: '복원된 프로필', daily_target: 5, experience: '10년 이상', updated_at: '2026-10-22T03:00:00Z' };
      else if (path === '/engagement') body = { liked_ids: [card.id], bookmarked_ids: [card.id] };
      else if (path === '/learning/today') body = { day: '2026-9-23', target_count: 1, done_count: 0, difficulty_cd: 'EASY', cards: [{ ...card, kind: 'REVIEW', done: false }] };
      else if (path === '/learning/quota') body = { limit: 5, used: 0 };
      else if (path === '/stats') body = { streak_days: 1, total_learned: 0, total_cards: 1, weekly: [], category_breakdown: [], rankings: [] };
      else if (path === '/community/live') body = { online_now: 0, studied_today: 0, leaderboard: [], companions: [], activities: [] };
      else if (/\/(feed|qna|notifications|tips|users|support|reports)$/.test(path)) body = [];
      if (path === '/learning/calendar') return route.fulfill({ status: 404, json: {} });
      await route.fulfill({ status: 200, json: body });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: new Date('2026-10-23T03:00:00Z') });
    await page.goto(origin + '/eduapp/');
    if (scenario === 'reinstall-delayed') {
      await expect(page.getByTestId('account-restore-notice')).toBeVisible();
      await page.waitForTimeout(400);
      assert(!page.url().includes('faction-select'));
      await expect(page.getByText('경력을 알려주세요', { exact: true })).toHaveCount(0);
    }
    if (scenario === 'lookup-failed') {
      await expect(page.getByTestId('account-restore-notice')).toContainText('계정 기록을 모두 가져오지 못했어요');
      assert(!page.url().includes('faction-select'));
      assert(!writes.some(w => w.path === '/me/faction'));
      await page.screenshot({ path: resolve(out, 'lookup-failed-320.png') });
      failed = false;
      await page.getByRole('button', { name: '계정 기록 다시 불러오기', exact: true }).click();
    }
    if (scenario === 'conflict') {
      await expect(page.getByText('경력을 알려주세요', { exact: true })).toBeVisible();
      await page.getByRole('radio', { name: '10년 이상', exact: true }).click();
      await page.getByRole('button', { name: '다음 · 진영 선택', exact: true }).click();
      await page.getByText('플레임', { exact: true }).click();
      await page.getByRole('button', { name: '플레임 진영으로 시작하기', exact: true }).click();
    }
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('faction') ?? '{}').state?.faction)).toBe('frost');
    await expect(page.getByTestId('home-hero')).toBeVisible();
    await expect(page.getByTestId('account-restore-notice')).toHaveCount(0);
    const disk = await page.evaluate(() => Object.fromEntries(['srs-scheduler', 'attendance', 'app-settings', 'collection', 'card-likes', 'bookmarks'].map(key => [key, JSON.parse(localStorage.getItem(key) ?? '{}').state])));
    assert.equal(disk['srs-scheduler'].cards[card.id].reps, 3);
    assert.deepEqual(disk['srs-scheduler'].history['2026-9-22'], [card.id]);
    assert(disk.attendance.stamps['2026-9-22']);
    assert.equal(disk.collection.packsEarned, 20);
    assert.equal(disk['app-settings'].experience, '10년 이상');
    assert.deepEqual(disk['card-likes'].ids, [card.id]); assert.deepEqual(disk.bookmarks.ids, [card.id]);
    assert(!writes.some(w => ['/progress/grade', '/progress/attendance', '/engagement/like', '/engagement/bookmark'].includes(w.path)));
    assert.equal(writes.filter(w => w.path === '/me/faction').length, scenario === 'conflict' ? 1 : 0);
    const image = page.getByTestId('appbar-logo-3').locator('img');
    const imageSource = await image.getAttribute('src');
    assert(imageSource);
    const imageUrl = new URL(imageSource, origin);
    assert.equal(imageUrl.origin, origin);
    const imageResponse = await context.request.get(imageUrl.href);
    assert.equal(sha(await imageResponse.body()), sha(readFileSync(new URL('../../assets/icon.png', import.meta.url))));
    await page.screenshot({ path: resolve(out, `${scenario}.png`) });
    await page.goto(origin + '/eduapp/edit-profile');
    await expect(page.getByText('프로스트 · 수호대', { exact: true })).toBeVisible();
    await page.screenshot({ path: resolve(out, `${scenario}-profile.png`) });
    results.push({ scenario, restoredFaction: 'frost', recordsPreserved: true, noLearningReplay: true, appbarLogo3Verified: true });
    await context.close();
  }
  assert.deepEqual(errors, []);
  writeFileSync(resolve(out, 'results.json'), JSON.stringify({ results, errors, note: 'Isolated API fixtures only; production audit is read-only and separate.' }, null, 2));
  console.log(JSON.stringify({ results, errors, out }));
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
