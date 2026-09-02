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
const q = (v) => JSON.stringify(v ?? '');
const lines = [];
const unknown = new Set();

// 퀴즈로 낼 수 있는 카드인가 — 보기와 정답이 **둘 다** 성립할 때만이다.
//
// 학습 화면은 퀴즈 카드를 풀기 전에는 뒤집지도 넘기지도 못하게 막는다. 그래서
// 보기가 비어 있는 퀴즈 카드가 한 장 섞이면 화면에는 고를 것이 하나도 없는데
// 넘어갈 수도 없다 — 그날 학습이 그 자리에서 멈춘다. 정답 번호가 없을 때도
// 마찬가지로 낮춘다: 없는 정답으로 채점하면 제대로 고른 사람이 오답이 된다.
//
// 앱의 CardMapper 도 서버 응답에 같은 규칙을 적용한다. 두 경로가 갈리면
// 목업에서만 멀쩡한 카드가 생긴다.
const answerable = (c) =>
  Array.isArray(c.choices) &&
  c.choices.length >= 2 &&
  Number.isInteger(c.answer_index) &&
  c.answer_index >= 0 &&
  c.answer_index < c.choices.length;

const demoted = [];

for (const c of cards) {
  if (!CATEGORY[c.category_cd]) unknown.add(c.category_cd);
  const isQuiz = c.card_type_cd && c.card_type_cd !== 'EXPLANATION';
  if (isQuiz && !answerable(c)) demoted.push(c.id);
  const f = [];
  f.push(`id: ${q(c.id)}`);
  if (isQuiz && answerable(c)) f.push(`type: ${q(TYPE[c.card_type_cd] ?? 'explanation')}`);
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
  
  if (c.image_url && c.image_url !== 'null' && c.image_url !== '') {
    body.push(`imageUrl: ${q(c.image_url)}`);
  }
  if (c.answer_image_url && c.answer_image_url !== 'null' && c.answer_image_url !== '') {
    body.push(`answerImageUrl: ${q(c.answer_image_url)}`);
  }
  if (answerable(c)) {
    body.push(`choices: ${JSON.stringify(c.choices)}`);
    body.push(`answerIndex: ${c.answer_index}`);
  }
  body.push(`principle: ${q(c.principle_txt)}`);
  if (c.process_txt) body.push(`process: ${q(c.process_txt)}`);
  if (c.fire_triangle_txt) body.push(`fireTriangle: ${q(c.fire_triangle_txt)}`);
  body.push(`conclusion: ${q(c.conclusion_txt)}`);
  if (c.source_txt) body.push(`source: ${q(c.source_txt)}`);
  
  const hasImageUrl = c.image_url && c.image_url !== 'null' && c.image_url !== '';
  const hasAnswerImageUrl = c.answer_image_url && c.answer_image_url !== 'null' && c.answer_image_url !== '';
  body.push(`hasImage: ${Boolean(hasImageUrl || hasAnswerImageUrl)}`);

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
if (demoted.length > 0) {
  // 조용히 낮추면 "왜 퀴즈가 설명형으로 나오지?" 를 아무도 추적하지 못한다.
  console.warn(
    `[build-card-seed] 보기·정답이 온전하지 않아 설명형으로 낮춘 카드 ${demoted.length}장: ${demoted.join(', ')}`,
  );
}
