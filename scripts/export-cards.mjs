#!/usr/bin/env node
/**
 * 번들 시드 카드를 서버가 받는 모양(CardDTO)으로 내보낸다.
 *
 * 왜 필요한가 — `src/data/cards.seed.ts` 의 카드들은 **앱 안에서만** 존재한다.
 * 목업 저장소(CardRepository.mock)가 그 파일을 읽어 화면을 채웠을 뿐, 서버 DB 에는
 * 한 장도 올라간 적이 없다. 그래서 실서버에 붙이는 순간 학습 화면이 비어 버린다
 * ("첫 접속인데 학습할 카드가 없음"). 이 스크립트는 그 간극을 메우는 통로다.
 *
 * 사용:
 *   node scripts/export-cards.mjs                  # stdout 으로 JSON 배열
 *   node scripts/export-cards.mjs -o cards.json    # 파일로
 *
 * 올리는 법(관리자 토큰 필요):
 *   POST {API}/inner/api/v1/cards  — 배열의 각 원소를 그대로 본문에 넣는다.
 *   앱의 CardRepository.createCards 가 하는 일과 같다(한 장씩 POST).
 *
 * ⚠ 이미지는 함께 가지 않는다. imageUrl 값('1-1' 같은 키)은 앱 번들 안의
 *    assets/img 파일을 가리킨다. 서버에 올린 카드가 그림을 보여주려면 그 파일들을
 *    따로 등록하고(서버의 카드 이미지 경로), 값을 그 주소로 바꿔야 한다.
 *    지금 상태로 올리면 카드는 나오지만 그림 자리는 비어 보인다.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * .ts 파일 하나를 그 자리에서 실행해 export 를 꺼낸다.
 *
 * 시드는 타입 주석이 붙은 거대한 리터럴이라 JSON 으로 그냥 읽을 수 없고, 정규식으로
 * 파싱하면 따옴표·중첩 하나에 조용히 깨진다. 이미 있는 컴파일러에게 맡기는 편이
 * 정확하고, 새 의존성도 늘지 않는다(typescript 는 tsc 때문에 이미 있다).
 */
function loadTsExports(relPath, stubs = {}) {
  const source = readFileSync(resolve(root, relPath), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  // `import type` 은 트랜스파일 단계에서 지워지므로, 남는 require 는 값 import 뿐이다.
  const req = (id) => stubs[id] ?? {};
  new Function('exports', 'module', 'require', js)(module.exports, module, req);
  return module.exports;
}

/**
 * 변환은 **앱 코드 그대로** 쓴다(domain/models/CardDraft.draftToDTO).
 *
 * 여기에 같은 매핑을 한 벌 더 적어 두면, 나중에 서버 계약이 바뀔 때 앱만 고치고
 * 이 스크립트는 잊혀진다. 그러면 내보낸 JSON 이 조용히 옛 모양으로 남아 서버가
 * 거절하거나 — 더 나쁘게는 — 일부 필드만 빠진 채로 등록된다.
 *
 * 이 모듈이 값으로 가져오는 것은 ALL_CATEGORIES 하나이고, draftToDTO 는 그것을
 * 쓰지 않으므로 빈 스텁으로 충분하다.
 */
const { draftToDTO: toDTO } = loadTsExports('src/domain/models/CardDraft.ts', {
  '../../constants/categories': { ALL_CATEGORIES: [] },
});

const { CARD_SEED } = loadTsExports('src/data/cards.seed.ts');
if (!Array.isArray(CARD_SEED) || CARD_SEED.length === 0) {
  console.error('CARD_SEED 를 읽지 못했습니다 — src/data/cards.seed.ts 를 확인하세요.');
  process.exit(1);
}

const dtos = CARD_SEED.map(toDTO);
const json = JSON.stringify(dtos, null, 2);

const outIdx = process.argv.findIndex((a) => a === '-o' || a === '--out');
if (outIdx !== -1 && process.argv[outIdx + 1]) {
  const out = resolve(process.cwd(), process.argv[outIdx + 1]);
  writeFileSync(out, json + '\n', 'utf8');
  const withImage = dtos.filter((d) => d.image_url).length;
  console.error(`카드 ${dtos.length}장(그림 있는 카드 ${withImage}장) → ${out}`);
} else {
  process.stdout.write(json + '\n');
}
