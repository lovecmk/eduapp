import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

// Exercise production repositories through isolated HTTP transport, without demo mode.
const bundle = resolve(process.argv[2] ?? 'dist');
const out = resolve(tmpdir(), 'd3m-card-presentation');
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
  if (!localStorage.getItem('app-settings')) localStorage.setItem('app-settings', JSON.stringify({ state: { themeMode: 'light', fontScale: 'medium' }, version: 2 }));
  localStorage.setItem('accessToken', 'isolated-ui-access');
  localStorage.setItem('refreshToken', 'isolated-ui-refresh');
  localStorage.setItem('cachedUser', JSON.stringify(user));
  localStorage.setItem('session-owner-id', user.id);
  localStorage.setItem('faction', JSON.stringify({ state: { faction: 'frost' }, version: 0 }));
}, user);
let mode = 'one';
let progress = { cards: {}, history: {}, attendance: {} };
let engagement = { liked_ids: [], bookmarked_ids: [] };
const difficultyVotes = { 'qa-card-3': 'normal' };
const card = { id: 'qa-card', category_cd: 'FIELD', sub_category_nm: '보험·요율', title_txt: '계약 점검', image_url: '1-1', answer_image_url: '1-2', format_nm: '기초용어형', card_type_cd: 'EXPLANATION', question_txt: '조건을 확인했습니까?', answer_txt: 'X', choices: ['O', 'X'], answer_index: 1, principle_txt: '독립된 해설', conclusion_txt: '독립된 해설', improvement_txt: '계약 조건을 확인하세요', note_txt: '예외 조항을 참고하세요', status_cd: 'NEW', difficulty_cd: 'EASY', study_seconds: 30, due_at: null };
Object.assign(card, { image_url: '', answer_image_url: '', situation_txt: '현장에서 긴 상황을 확인해요. '.repeat(12), conclusion_txt: '해설은 위험을 먼저 확인합니다.', principle_txt: '상세설명은 원인을 설명합니다.', process_txt: '발열 → 점화 → 확산', fire_triangle_txt: '가연물 · 산소 · 열' });
const deck = [card, { ...card, id: 'qa-card-2', title_txt: '두 번째 점검' }, { ...card, id: 'qa-card-3', title_txt: '세 번째 점검' }];
await context.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (!url.pathname.startsWith('/inner/api/v1/')) {
    assert.equal(url.origin, origin, 'Unexpected external request');
    return route.continue();
  }
  const path = url.pathname.slice('/inner/api/v1'.length);
  requests.push({ method: route.request().method(), path, body: route.request().postData() });
  let status = 200, body = {};
  if (path === '/auth/me') { status = mode === 'expired' ? 401 : 200; body = user; }
  else if (path === '/auth/refresh') { status = 401; body = { message: 'expired' }; }
  else if (path === '/cards') { status = mode === 'error' ? 503 : 200; body = mode === 'one' ? deck : []; }
  else if (/^\/cards\/qa-card(?:-\d)?\/edit$/.test(path)) body = { ...deck.find(card => path.includes(card.id + '/edit')), status_cd: route.request().postDataJSON().status_cd };
  else if (path === '/learning/today') body = { cards: deck.map(card => ({ ...card, kind: 'NEW', done: false })), target_count: 3, done_count: 0, difficulty_cd: 'EASY' };
  else if (path === '/progress' && route.request().method() === 'GET') body = progress;
  else if (path === '/progress/grade') { const data = route.request().postDataJSON(); progress.cards[data.card_id] = { ...data, last_grade: data.grade }; }
  else if (path === '/engagement' && route.request().method() === 'GET') body = engagement;
  else if (path === '/engagement/like' || path === '/engagement/bookmark') { const data = route.request().postDataJSON(); const key = path.endsWith('/like') ? 'liked_ids' : 'bookmarked_ids'; const on = data.liked ?? data.bookmarked; engagement[key] = on ? [...new Set([...engagement[key], data.card_id])] : engagement[key].filter(id => id !== data.card_id); }
  else if (path === '/stats') body = { streak_days: 0, best_streak: 0, total_learned: 0, total_cards: 0, accuracy_rate: 0, due_today: 0, weekly: [], category_breakdown: [], rankings: [] };
  else if (path === '/community/live') body = { online_now: 0, studied_today: 0, total_minutes_today: 0, daily_goal_minutes: 3, companions: [], activities: [], leaderboard: [], building: { floor_size: 20000, current: { month: '2026-10', label: '10월', problems: 0, floors: 0, winner: '' }, history: [] } };
  else if (path === '/learning/quota') body = { limit: 3, used: 0, resets_at: '2026-10-15T00:00:00+09:00' };
  else if (path === '/rooftop') body = { month: '2026-10', floors: 0, my_bricks: 0, history: [] };
  else if (/\/(feed|qna|notifications|users|tips|support)$/.test(path) || path.endsWith('/tips')) body = [];
  else if (path === '/weather/current') body = { condition: 'clear', observed_at: '2026-10-14T00:00:00Z' };
  else if (path.endsWith('/difficulty')) {
    const cardId = path.split('/')[2];
    if (route.request().method() === 'POST') difficultyVotes[cardId] = route.request().postDataJSON().vote;
    body = { mine: difficultyVotes[cardId] ?? null, easy: 1, normal: 2, hard: 7 };
  }
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
  assert(await page.getByText('학습 완료 카드', { exact: true }).count(), 'Home label');
  if (await page.getByText('나중에 할게요', { exact: true }).isVisible()) await page.getByText('나중에 할게요', { exact: true }).click();
  await page.getByRole('tab').filter({ hasText: '학습' }).click();
  await front.waitFor(); await face(false);
  const typography = await front.evaluate(el => {
    const texts = [...el.querySelectorAll('div')];
    const situation = texts.find(e => e.textContent.startsWith('현장에서 긴 상황') && !e.children.length);
    const question = texts.find(e => e.textContent === 'Q. 조건을 확인했습니까?');
    return [situation, question].map(e => { const s = getComputedStyle(e); return { size: s.fontSize, line: s.lineHeight, weight: s.fontWeight }; });
  });
  assert.deepEqual(typography[0], typography[1], 'Situation and question typography');
  await page.getByLabel('카드 뒤집기', { exact: true }).click(); await face(true);
  const body = await back.innerText();
  const positions = ['해설은 위험', '상세설명은 원인', '발열', '가연물'].map(text => body.indexOf(text));
  assert(positions.every((p, i) => p >= 0 && (i === 0 || p > positions[i-1])), 'Back section order');
  await back.getByLabel('좋아요', { exact: true }).click();
  await face(true); // Clicking an action must not flip the card.
  await back.getByLabel('저장', { exact: true }).click();
  await back.getByLabel('신고', { exact: true }).click();
  await page.getByText('카드 신고 · 내용 수정 요청', { exact: true }).waitFor();
  await page.getByText('신고 보내기', { exact: true }).click();
  await page.getByText('신고가 접수되었어요', { exact: true }).waitFor();
  await page.getByText('확인', { exact: true }).click();
  await page.getByText('다시 보면 좋겠어요', { exact: true }).click();
  await page.getByText('이 문제, 얼마나 어려웠나요?', { exact: true }).waitFor();
  const modal = page.getByText('이 문제, 얼마나 어려웠나요?', { exact: true }).locator('..').locator('..');
  assert.equal(await modal.getByTestId('card-reactions').count(), 0, 'No reactions in difficulty modal');
  await modal.getByText('어려움', { exact: true }).click(); await page.waitForTimeout(850); await face(false);
  await page.getByLabel('카드 뒤집기', { exact: true }).click(); await face(true);
  assert(await back.getByLabel('좋아요', { exact: true }).count(), 'Next card is not liked');
  assert(await back.getByLabel('저장', { exact: true }).count(), 'Next card is not saved');
  await go('/content/qa-card');
  await page.getByTestId('first-review-choice').waitFor();
  assert(await page.getByLabel('다음에 한번 더 볼게요 · 처음 선택', { exact: true }).count(), 'First decision restored');
  const initial = await page.getByTestId('first-review-choice').innerText();
  assert(await page.getByLabel('좋아요 취소').count(), 'Detail uses same like state');
  assert(await page.getByLabel('저장 취소').count(), 'Detail uses same bookmark state');
  // A newer server grade must not replace the initial choice displayed in review.
  progress.cards['qa-card'] = { ...progress.cards['qa-card'], last_grade: 'good', grade: 'good', reps: 2, last_reviewed_at: new Date(Date.now() + 1000).toISOString() };
  await page.reload(); await page.getByTestId('first-review-choice').waitFor();
  await page.waitForTimeout(500);
  const savedChoice = page.getByTestId('recorded-review-choice');
  const difficulty = page.getByTestId('review-difficulty');
  // 해설 아래 순서: 현장 팁 → 처음 선택한 답변 → 체감 난이도
  const tipsY = (await page.getByLabel('이 카드에 남길 팁').boundingBox()).y;
  const choiceY = (await savedChoice.boundingBox()).y;
  const difficultyY = (await difficulty.getByTestId('difficulty-options').boundingBox()).y;
  assert(tipsY < choiceY && choiceY < difficultyY, 'Tips, then recorded choice, then difficulty');
  assert.equal(await difficulty.getByTestId('recorded-review-choice').count(), 1, 'Choice belongs inside difficulty card');
  assert(await savedChoice.getByLabel('다음에 한번 더 볼게요 · 처음 선택', { exact: true }).count(), 'Initial choice survives newer last grade');
  assert(await savedChoice.getByText('다음에 한번 더 볼게요', { exact: true }).count(), 'Initial choice restored');
  assert.equal(await savedChoice.getByRole('button').count(), 0, 'No self-check buttons in review');
  assert.equal(await difficulty.getByRole('button').count(), 0, 'No voting buttons in review');
  const choiceSizes = await Promise.all(['다음에 한번 더 볼게요 · 처음 선택', '이해했어요'].map(label => savedChoice.getByLabel(label, { exact: true }).boundingBox()));
  assert(choiceSizes.every(box => box.height >= 40 && box.height <= 58), `Compact recorded choices: ${JSON.stringify(choiceSizes)}`);
  assert.equal(choiceSizes[0].height, choiceSizes[1].height, 'Both recorded choices have the same compact height');
  checks.push({ case: 'compact recorded choices', heights: choiceSizes.map(box => box.height) });
  assert(await difficulty.getByLabel('어려웠어요 · 내 선택', { exact: true }).count(), 'Selected difficulty restored');
  const cardState = () => page.evaluate(() => JSON.parse(localStorage.getItem('srs-scheduler')).state.cards['qa-card']);
  const before = await cardState();
  assert.equal(before.lastGrade, 'good', 'Fixture contains a different latest grade');
  assert.equal(before.firstGrade, 'again', 'Initial grade preserved separately');
  const writes = () => requests.filter(r => r.method === 'POST' && (r.path === '/progress/grade' || r.path.endsWith('/difficulty'))).length;
  const beforeWrites = writes();
  await difficulty.getByLabel('쉬웠어요', { exact: true }).click();
  await savedChoice.getByLabel('이해했어요', { exact: true }).click({ force: true });
  await savedChoice.getByLabel('다음에 한번 더 볼게요 · 처음 선택', { exact: true }).click({ force: true });
  await page.waitForTimeout(300);
  assert(await difficulty.getByLabel('어려웠어요 · 내 선택', { exact: true }).count(), 'Click cannot change difficulty');
  assert(await savedChoice.getByLabel('다음에 한번 더 볼게요 · 처음 선택', { exact: true }).count(), 'Both disabled options retain initial choice');
  assert.deepEqual(await cardState(), before, 'Viewing records leaves schedule and history unchanged');
  assert.equal(writes(), beforeWrites, 'No grade or vote writes from review');
  assert.equal(await page.getByTestId('first-review-choice').innerText(), initial, 'Review does not overwrite first decision');
  await page.reload(); await page.getByTestId('first-review-choice').waitFor();
  assert.equal(await page.getByTestId('first-review-choice').innerText(), initial, 'First decision survives reload/server merge');
  assert.deepEqual(await cardState(), before, 'Read-only record survives reload without rescheduling');
  assert.equal(writes(), beforeWrites, 'Reload creates no grade or vote writes');
  await go('/content/qa-card-3');
  assert((await page.getByTestId('first-review-choice').innerText()).includes('확인할 수 없어요'), 'Unknown history is not invented');
  assert(await page.getByLabel('적당해요 · 내 선택', { exact: true }).count(), 'Other-device server difficulty restored');
  assert.equal(await page.getByTestId('recorded-review-choice').getByLabel(/처음 선택/).count(), 0, 'No invented initial decision');
  await go('/content/qa-card-2');
  assert(await page.getByText('아직 난이도 선택 기록이 없어요', { exact: true }).count(), 'Missing difficulty is read-only too');
  assert.equal(await page.getByTestId('review-difficulty').getByRole('button').count(), 0, 'Missing difficulty cannot be voted in review');
  for (const theme of ['light', 'dark']) {
    for (const width of [320, 390]) {
      await page.evaluate(theme => localStorage.setItem('app-settings', JSON.stringify({ state: { themeMode: theme, fontScale: 'xlarge' }, version: 2 })), theme);
      await go('/content/qa-card', width);
      await page.getByTestId('recorded-review-choice').scrollIntoViewIfNeeded();
      const record = page.getByTestId('recorded-review-choice');
      for (const label of ['다음에 한번 더 볼게요 · 처음 선택', '이해했어요']) {
        const option = record.getByLabel(label, { exact: true });
        const text = option.getByText(label.replace(' · 처음 선택', ''), { exact: true });
        const box = await option.boundingBox(), textBox = await text.boundingBox();
        assert(textBox.y >= box.y && textBox.y + textBox.height <= box.y + box.height, 'Large text fits the compact record without clipping');
      }
      await page.waitForTimeout(600);
      await page.screenshot({ path: resolve(out, `review-${theme}-${width}.png`), fullPage: true });
      checks.push({ case: 'review responsive/theme/xlarge', theme, width });
      await go('/cards', width); await front.waitFor(); await face(false);
      await page.getByLabel('카드 뒤집기', { exact: true }).click(); await face(true);
      await back.getByRole('button', { name: /^신고/ }).scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await page.screenshot({ path: resolve(out, `back-${theme}-${width}.png`) });
      checks.push({ case: 'learning responsive/theme/xlarge', theme, width });
    }
  }
  assert(requests.some(r => r.path === '/engagement/like' && JSON.parse(r.body).card_id === 'qa-card'), 'Like API');
  assert(requests.some(r => r.path === '/engagement/bookmark' && JSON.parse(r.body).card_id === 'qa-card'), 'Bookmark API');
  assert(requests.some(r => r.path === '/reports' && JSON.parse(r.body).card_id === 'qa-card'), 'Report API');
  assert(requests.some(r => r.path === '/progress/grade' && JSON.parse(r.body).self_check === 'REVIEW'), 'Initial REVIEW API');
  assert(!requests.some(r => r.path === '/progress/grade' && JSON.parse(r.body).self_check === 'KNOWN'), 'Review never regrades the card');
  assert.equal(errors.length, 0, errors.join('\n'));
  writeFileSync(resolve(out, 'result.json'), JSON.stringify({ checks, errors, requests }, null, 2));
  console.log(JSON.stringify({ checks: checks.length, errors, out }));
} finally { await browser.close(); await new Promise(done => server.close(done)); }
