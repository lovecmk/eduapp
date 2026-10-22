import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const bundle = resolve(process.argv[2] ?? 'dist');
const out = resolve(tmpdir(), 'haru-learning-calendar-qa');
mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.woff': 'font/woff' };
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/eduapp(?=\/|$)/, '');
  let file = resolve(bundle, '.' + pathname);
  if (!file.startsWith(bundle + '/') && !file.startsWith(bundle + '\\') && file !== bundle) { response.writeHead(403).end(); return; }
  if (!existsSync(file) || !extname(file) || statSync(file).isDirectory()) file = resolve(bundle, 'index.html');
  response.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
  response.end(readFileSync(file));
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = 'http://127.0.0.1:' + server.address().port;
let browser;
try {
  browser = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge' } : {});
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Los_Angeles' });
  const user = { id: 'calendar-qa', user_nm: '점검 사용자', nickname: 'QA', email_addr: 'qa@example.test', membership_cd: 'BASIC', role_cd: 'USER', status_cd: 'A', created_at: '2026-10-01T00:00:00Z' };
  await context.addInitScript(user => {
    localStorage.setItem('accessToken', 'isolated-calendar-access');
    localStorage.setItem('refreshToken', 'isolated-calendar-refresh');
    localStorage.setItem('cachedUser', JSON.stringify(user));
    localStorage.setItem('session-owner-id', user.id);
    localStorage.setItem('faction', JSON.stringify({ state: { faction: 'frost' }, version: 0 }));
    localStorage.setItem('app-settings', JSON.stringify({ state: { themeMode: 'light', fontScale: 'medium' }, version: 2 }));
  }, user);
  const fresh = { id: 'new-card', category_cd: 'ELEC', sub_category_nm: '배선', question_txt: '신규 문제는 주말에 열리지 않습니다', title_txt: '새 카드', format_nm: '설명형', card_type_cd: 'EXPLANATION', status_cd: 'NEW', difficulty_cd: 'EASY', study_seconds: 30, principle_txt: '안전 점검', due_at: null };
  const review = { ...fresh, id: 'review-card', title_txt: '복습 카드', question_txt: '복습 문제는 주말에도 가능합니다', status_cd: 'LEARNING', due_at: '2026-10-24T00:00:00+09:00' };
  const futureReview = { ...review, id: 'future-review', question_txt: '일요일 복습 일정 확인', due_at: '2026-10-25T00:00:00+09:00' };
  const pastReview = { ...review, id: 'past-review', question_txt: '지난 일정은 오늘 복습으로 표시', due_at: '2026-10-18T00:00:00+09:00' };
  const ghost = { ...fresh, id: 'unlearned', question_txt: '학습 전 카드는 복습 일정에 없어야 합니다', due_at: futureReview.due_at };
  const known = { ...review, id: 'known', question_txt: '이해한 카드는 복습 일정에 없어야 합니다', status_cd: 'MASTERED', due_at: futureReview.due_at };
  let calendarMode = false;
  const writes = [], errors = [];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/inner/api/v1/')) { assert.equal(url.origin, origin); return route.continue(); }
    const path = url.pathname.slice('/inner/api/v1'.length);
    if (route.request().method() !== 'GET') writes.push({ path, body: route.request().postData() });
    let body = {}, status = 200;
    if (path === '/auth/me') body = user;
    else if (path === '/cards') body = calendarMode ? [fresh, review, futureReview, pastReview, ghost, known] : [fresh, review];
    else if (path === '/learning/today') body = { cards: [{ ...fresh, kind: 'NEW', done: false }, { ...review, kind: 'REVIEW', done: false }], target_count: 2, done_count: 0, difficulty_cd: 'EASY' };
    else if (path === '/learning/quota') body = { limit: 3, used: 0 };
    else if (path === '/learning/calendar') { status = 404; body = { message: 'older server' }; }
    else if (path === '/progress') {
      const schedule = card => ({ box: 0, ease: 2.5, reps: 1, lapses: 1, due_at: card.due_at, last_grade: 'again', last_reviewed_at: '2026-10-13T00:00:00+09:00' });
      body = { cards: { 'review-card': schedule(review), ...(calendarMode ? {
        [futureReview.id]: schedule(futureReview), [pastReview.id]: schedule(pastReview),
        [ghost.id]: { ...schedule(ghost), reps: 0 }, [known.id]: { ...schedule(known), box: 4, last_grade: 'good' },
      } : {}) }, history: calendarMode ? { '2026-9-23': [pastReview.id, pastReview.id, 'removed-card'] } : {}, attendance: {} };
    }
    else if (path === '/stats') body = { streak_days: 0, best_streak: 0, total_learned: 0, total_cards: 2, accuracy_rate: 0, due_today: 1, weekly: [], category_breakdown: [], rankings: [] };
    else if (path === '/engagement') body = { liked_ids: [], bookmarked_ids: [] };
    else if (path === '/community/live') body = { online_now: 0, studied_today: 0, total_minutes_today: 0, daily_goal_minutes: 3, companions: [], activities: [], leaderboard: [], building: { floor_size: 20000, current: { month: '2026-10', label: '10월', problems: 0, floors: 0, winner: '' }, history: [] } };
    else if (/\/(feed|qna|notifications|users|tips|support)$/.test(path) || path.endsWith('/tips')) body = [];
    else if (path === '/rooftop') body = { month: '2026-10', floors: 0, my_bricks: 0, history: [] };
    else if (path.endsWith('/difficulty')) body = { mine: null, easy: 0, normal: 0, hard: 0 };
    await route.fulfill({ status, json: body });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date('2026-10-24T03:00:00Z') });
  const go = async path => { await page.goto(origin + '/eduapp' + path); await page.waitForTimeout(1000); };
  await go('/cards?focusId=new-card');
  await expect(page.getByText('오늘은 신규 학습 쉬는 날', { exact: true })).toBeVisible();
  await expect(page.getByTestId('learning-card-front')).toHaveCount(0);
  await go('/cards');
  await expect(page.getByTestId('learning-card-front')).toContainText(review.question_txt);
  await expect(page.getByTestId('learning-card-front')).not.toContainText(fresh.question_txt);
  calendarMode = true;
  await go('/');
  if (await page.getByText('나중에 할게요', { exact: true }).isVisible()) await page.getByText('나중에 할게요', { exact: true }).click();
  await expect(page.getByText('신규 학습 쉬는 날', { exact: true })).toBeVisible();
  const rest = page.getByRole('button', { name: /10월 24일 주말 신규 학습 쉬는 날, 복습 가능/ });
  await expect(rest).toContainText('쉼');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await rest.scrollIntoViewIfNeeded();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'mobile calendar overflow');
    await page.screenshot({ path: resolve(out, `calendar-${width}.png`), fullPage: true });
  }
  await rest.click();
  await expect(page.getByText('주말 · 신규 학습 쉬는 날 · 복습 가능', { exact: true })).toBeVisible();
  await expect(page.getByText('오늘 복습 일정 2', { exact: true })).toBeVisible();
  await expect(page.getByText(pastReview.question_txt, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '닫기', exact: true }).last().click();
  await page.waitForTimeout(300);
  const sunday = page.getByRole('button', { name: /^10월 25일 .*복습 일정 1장/ });
  await expect(sunday).toContainText('쉼');
  await sunday.click();
  await expect(page.getByText('복습 예정 1', { exact: true })).toBeVisible();
  await expect(page.getByText(futureReview.question_txt, { exact: true })).toBeVisible();
  await expect(page.getByText(ghost.question_txt, { exact: true })).toHaveCount(0);
  await expect(page.getByText(known.question_txt, { exact: true })).toHaveCount(0);
  await expect(page.getByText('이 날은 학습·복습 기록이 없어요', { exact: true })).toHaveCount(0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(out, 'sunday-review-detail.png') });
  await page.getByRole('button', { name: '닫기', exact: true }).last().click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /^10월 18일 / }).click();
  await expect(page.getByText('학습·복습한 카드 0', { exact: true })).toBeVisible();
  await expect(page.getByText(/^(복습 예정|오늘 복습 일정) \d/)).toHaveCount(0);
  await expect(page.getByText(pastReview.question_txt, { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '닫기', exact: true }).last().click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /^10월 23일 .*학습·복습 기록 2장/ }).click();
  await expect(page.getByText('학습·복습한 카드 2', { exact: true })).toBeVisible();
  await expect(page.getByText('현재 볼 수 없는 카드 1장의 기록이 포함되어 있어요', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '닫기', exact: true }).last().click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /^10월 26일 / }).click();
  await expect(page.getByText('복습 예정 0', { exact: true })).toBeVisible();
  await expect(page.getByText('예정된 복습 카드가 없어요', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '닫기', exact: true }).last().click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '2026년 10월', exact: true }).click();
  await page.getByRole('button', { name: '2027', exact: true }).click();
  await page.getByRole('button', { name: '5월', exact: true }).click();
  await page.getByRole('button', { name: '적용', exact: true }).click();
  await expect(page.getByRole('button', { name: '적용', exact: true })).toBeHidden();
  await page.waitForTimeout(350);
  const substitute = page.getByRole('button', { name: /5월 3일 대체공휴일.*신규 학습 쉬는 날/ });
  await expect(substitute).toContainText('쉼');
  await substitute.scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(out, 'calendar-2027-05-320.png') });
  await page.getByRole('button', { name: '이번 달로 돌아가기', exact: true }).click();
  await expect(page.getByRole('button', { name: '2026년 10월', exact: true })).toBeVisible();
  await go('/community');
  await expect(page.getByText('질문 & 답변', { exact: true })).toBeVisible();
  await expect(page.getByText('지금 함께 학습 중', { exact: true })).toHaveCount(0);
  calendarMode = false;
  const midnight = await context.newPage();
  midnight.on('pageerror', error => errors.push(error.message));
  await midnight.clock.install({ time: new Date('2026-10-23T14:59:00Z') });
  await midnight.goto(origin + '/eduapp/cards');
  await expect(midnight.getByTestId('learning-card-front')).toContainText(fresh.question_txt);
  await midnight.clock.pauseAt(new Date('2026-10-23T14:59:59Z'));
  await midnight.clock.runFor(1000);
  await expect(midnight.getByTestId('learning-card-front')).toContainText(review.question_txt);
  await expect(midnight.getByTestId('learning-card-front')).not.toContainText(fresh.question_txt);
  await midnight.close();
  assert(!writes.some(item => item.path === '/progress/grade'), 'reading a rest day must not create learning');
  assert.deepEqual(errors, []);
  console.log('PASS mobile calendar: KST/foreign timezone and midnight, 390/320px, weekend reviews, overdue moved to today, past history only, unique/unavailable records, NEW/KNOWN excluded, empty future, current-month navigation, 2027 holiday, community presence hidden');
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
