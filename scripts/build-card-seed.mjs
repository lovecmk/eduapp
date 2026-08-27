// 서버 시드(cards_seed.json) → 앱 목업 시드(src/data/cards.seed.ts) 생성기.
//
//   node scripts/build-card-seed.mjs [.../daily3min/seed/cards_seed.json]
//
// ── 왜 목업 시드가 서버 시드에서 나와야 하나 ──────────────────────────────────
// 목업은 서버 없이 화면을 돌려 보는 길이다(EXPO_PUBLIC_USE_MOCK_DATA=true, 또는
// 주소가 비어 있을 때의 자동 폴백). 그런데 그 콘텐츠를 손으로 따로 적어 두면
// 시간이 지날수록 서버와 갈라지고, 목업에서만 보이는 문제·목업에서만 안 보이는
// 문제가 생긴다. 그때 개발자가 보는 화면은 사용자가 보는 화면이 아니다.
//
// 그래서 **한 원본에서 둘을 뽑는다.** 엑셀 → (BE 생성기) → cards_seed.json →
// (이 스크립트) → cards.seed.ts. 가운데를 거치는 이유는 분류 코드·형식 코드처럼
// 서버가 정하는 것들이 이미 그 파일에서 확정되기 때문이다 — 엑셀에서 두 번
// 해석하면 두 해석이 어긋날 자리가 생긴다.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SEED = resolve(
  here,
  '../../insu/0021_BRIDGE_CODE/kfpa/BE/daily3min/seed/cards_seed.json',
);
const OUT = resolve(here, '../src/data/cards.seed.ts');

// 서버 분류 코드 → 앱 대분류.
// src/data/mappers/CardMapper.ts 의 CATEGORY_MAP 과 **같은 값이어야 한다**
// (그쪽이 실서버 응답을 접는 표이고, 이쪽은 목업을 접는 표다).
const CATEGORY = {
  ELEC: '전기 위험',
  BATTERY: '전기 위험',
  PROCESS: '공정 위험',
  HAZMAT: '위험물',
  FIELD: '현장 점검',
  FIRE: '현장 점검',
  EGRESS: '현장 점검',
  SPREAD: '현장 점검',
  ETC: '현장 점검',
};
const DIFFICULTY = { EASY: 'easy', MEDIUM: 'medium', HARD: 'hard' };
const TYPE = { EXPLANATION: 'explanation', OX: 'ox', CHOICE: 'choice' };

const src = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_SEED;
const cards = JSON.parse(readFileSync(src, 'utf8'));

const q = (v) => JSON.stringify(v ?? '');
const lines = [];
const unknown = new Set();

for (const c of cards) {
  if (!CATEGORY[c.category_cd]) unknown.add(c.category_cd);
  const f = [];
  f.push(`id: ${q(c.id)}`);
  if (c.card_type_cd && c.card_type_cd !== 'EXPLANATION') f.push(`type: ${q(TYPE[c.card_type_cd] ?? 'explanation')}`);
  f.push(`category: ${q(CATEGORY[c.category_cd] ?? '현장 점검')}`);
  f.push(`subCategory: ${q(c.sub_category_nm)}`);
  f.push(`topic: ${q(c.topic_nm)}`);
  f.push(`keywords: ${JSON.stringify(c.keywords ?? [])}`);
  f.push(`title: ${q(c.title_txt)}`);
  f.push(`difficulty: ${q(DIFFICULTY[c.difficulty_cd] ?? 'medium')}`);
  f.push(`studySeconds: ${c.study_seconds || 40}`);
  const body = [];
  body.push(`situation: ${q(c.situation_txt)}`);
  body.push(`question: ${q(c.question_txt)}`);
  if (c.image_url) body.push(`imageUrl: ${q(c.image_url)}`);
  if (c.answer_image_url) body.push(`answerImageUrl: ${q(c.answer_image_url)}`);
  if (c.choices?.length) {
    body.push(`choices: ${JSON.stringify(c.choices)}`);
    if (c.answer_index !== null && c.answer_index !== undefined) body.push(`answerIndex: ${c.answer_index}`);
  }
  body.push(`principle: ${q(c.principle_txt)}`);
  if (c.process_txt) body.push(`process: ${q(c.process_txt)}`);
  if (c.fire_triangle_txt) body.push(`fireTriangle: ${q(c.fire_triangle_txt)}`);
  body.push(`conclusion: ${q(c.conclusion_txt)}`);
  if (c.source_txt) body.push(`source: ${q(c.source_txt)}`);
  body.push(`hasImage: ${Boolean(c.image_url || c.answer_image_url)}`);

  lines.push(`  { ${f.join(', ')},\n    ${body.join(',\n    ')} },`);
}

if (unknown.size > 0) {
  console.warn(`[build-card-seed] 표에 없는 분야 코드: ${[...unknown].join(', ')} — 현장 점검으로 접었습니다`);
}

const out = `// 학습카드 목업 시드 — **자동 생성 파일이므로 손으로 고치지 않는다.**
//
//   node scripts/build-card-seed.mjs
//
// 원본은 서버 시드(BE/daily3min/seed/cards_seed.json)이고, 그 원본은 다시 공식
// 학습카드 양식(.xlsx)에서 나온다. 목업을 손으로 적어 두면 서버와 갈라져
// "개발자가 보는 화면"과 "사용자가 보는 화면"이 달라진다.
//
// 목업은 서버 없이 화면을 돌려 볼 때만 쓰인다(EXPO_PUBLIC_USE_MOCK_DATA=true,
// 또는 API 주소가 비어 있을 때의 자동 폴백). 실서버 모드에서는 이 파일이
// 아니라 /inner/api/v1/cards 응답이 콘텐츠 원천이다.
import type { SeedCard } from '../domain/models/LearningCard';

export const CARD_SEED: SeedCard[] = [
${lines.join('\n')}
];
`;

writeFileSync(OUT, out, 'utf8');
console.log(`[build-card-seed] ${cards.length}장 → ${OUT}`);
