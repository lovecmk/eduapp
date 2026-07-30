#!/usr/bin/env node
/**
 * 관리 콘솔을 눈으로 확인하기 위한 데모 데이터 심기.
 *
 * ── 왜 필요한가 ────────────────────────────────────────────────────────────
 * 갓 띄운 서버에는 학습 기록이 없다. 그 상태의 관리 콘솔은 정직하게 "기록이
 * 아직 없습니다"만 보여 주므로, 화면을 손보거나 검토할 수가 없다.
 * 그림(다른 직원과의 비교·분야별 차이·학습 리듬)은 비교 대상이 있어야 나온다.
 *
 * ── 무엇을 심는가 ──────────────────────────────────────────────────────────
 * 진단 규칙이 실제로 갈라지는 세 가지 상황을 일부러 만든다. 무작위로 뿌리면
 * 아무 판정도 나오지 않거나 매번 다른 화면이 떠서 비교가 안 된다.
 *
 *   · 전기(ELEC)    — 다른 직원은 잘 맞히는데 대상자만 많이 틀림 → '이 사람 약점'
 *   · 위험물(HAZMAT) — 모두가 많이 틀림                        → '문제·자료 손보기'
 *   · 공정(PROCESS)  — 모두 잘함                              → 처방 없음
 *
 * 이 세 갈래가 화면에서 서로 다르게 다뤄지는지가 이 콘솔의 핵심이다.
 *
 * 실행:  node scripts/demo-data.mjs
 *        BASE=http://localhost:8080 ADMIN_ID=admin ADMIN_PW='admin1234!' node scripts/demo-data.mjs
 */

const BASE = process.env.BASE ?? 'http://localhost:8080';
const ADMIN_ID = process.env.ADMIN_ID ?? 'admin';
const ADMIN_PW = process.env.ADMIN_PW ?? 'admin1234!';

/** 무인증 경로의 IP 당 분당 요청 제한(server.go 의 loginAttemptsPerMinute). */
const AUTH_LIMIT_PER_MIN = 20;

const PEERS = 10;
const DEMO_PW = 'Passw0rd!123';

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}

const iso = (daysAgo = 0) =>
  new Date(Date.now() - daysAgo * 86_400_000).toISOString();

/** 채점 한 건 보고 — 앱이 쓰는 것과 같은 경로다(관리 화면도 여기를 읽는다). */
const grade = (token, cardId, { reps, lapses, box, grade: g }) =>
  api('/api/progress/grade', {
    method: 'POST',
    token,
    body: {
      card_id: cardId,
      grade: g,
      box,
      ease: 2.3,
      due_at: iso(-3),
      reps,
      lapses,
      last_reviewed_at: iso(0),
    },
  });

async function signup(username, name, org) {
  const r = await api('/api/auth/register', {
    method: 'POST',
    body: {
      username,
      password: DEMO_PW,
      name,
      nickname: name,
      email: `${username}@example.com`,
      org,
    },
  });
  return r.access_token;
}

async function main() {
  process.stdout.write(`서버 ${BASE} 확인… `);
  const health = await api('/api/health');
  console.log(`${health.status} (저장소 ${health.store})`);

  const admin = (await api('/api/auth/login', { method: 'POST', body: { id: ADMIN_ID, password: ADMIN_PW } }))
    .access_token;

  const all = await api('/api/cards', { token: admin });
  const cards = all.items ?? all;
  const byCat = (cat, n) => cards.filter((c) => c.category_cd === cat).slice(0, n);

  const elec = byCat('ELEC', 6); //  대상자만 틀리는 분야
  const proc = byCat('PROCESS', 6); //  모두 잘하는 분야
  const haz = byCat('HAZMAT', 4); //  모두 틀리는 분야
  if (!elec.length || !proc.length || !haz.length) {
    throw new Error('시드 카드가 부족합니다 — SEED_ON_START=true 로 기동했는지 확인하세요');
  }

  // 가입은 무인증 경로라 분당 제한이 걸린다. 걸리면 429 로 실패하므로
  // 제한에 닿기 전에 미리 쉰다(실패 후 재시도보다 예측 가능하다).
  let signups = 0;
  const throttle = async () => {
    if (++signups % (AUTH_LIMIT_PER_MIN - 4) === 0) {
      console.log('  · 가입 속도 제한 대기 62초…');
      await new Promise((r) => setTimeout(r, 62_000));
    }
  };

  console.log(`동료 ${PEERS}명 심는 중…`);
  for (let i = 0; i < PEERS; i++) {
    await throttle();
    const token = await signup(`peer${String(i).padStart(2, '0')}`, `동료${i}`, '1공장');
    for (const c of [...elec, ...proc]) await grade(token, c.id, { reps: 10, lapses: 1, box: 4, grade: 'good' });
    for (const c of haz) await grade(token, c.id, { reps: 10, lapses: 8, box: 0, grade: 'again' });
  }

  console.log('진단 대상자(wonjs) 심는 중…');
  await throttle();
  const target = await signup('wonjs', '원진섭', '1공장');
  // 전기만 유독 못한다 → 개인 약점으로 잡혀야 한다.
  for (const c of elec) await grade(target, c.id, { reps: 12, lapses: 9, box: 0, grade: 'again' });
  // 공정은 남들과 같다 → 처방이 나오면 안 된다.
  for (const c of proc) await grade(target, c.id, { reps: 10, lapses: 1, box: 4, grade: 'good' });
  // 위험물은 남들도 틀린다 → 개인 교육이 아니라 자료 손보기로 갈라져야 한다.
  for (const c of haz) await grade(target, c.id, { reps: 10, lapses: 8, box: 0, grade: 'again' });
  await api('/api/progress/attendance', { method: 'POST', token: target, body: { day: '' } });

  const users = await api('/api/admin/users?search=wonjs', { token: admin });
  const id = users.items?.[0]?.id ?? '(찾지 못함)';

  console.log('\n완료. 관리 콘솔에서 확인하세요:');
  console.log(`  분석            /admin/insight`);
  console.log(`  직원 상세(진단)  /admin/users/${id}`);
  console.log(`  로그인          ${ADMIN_ID} / ${ADMIN_PW}`);
}

main().catch((err) => {
  console.error('\n실패:', err.message);
  console.error('\n서버가 떠 있는지, 관리자 계정이 만들어졌는지 확인하세요:');
  console.error('  cd backend && make dev');
  process.exit(1);
});
