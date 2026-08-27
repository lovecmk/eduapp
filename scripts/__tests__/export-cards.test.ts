// 카드 내보내기 스크립트 — 실제로 돌려 보고 결과를 확인한다.
//
// 이 검사가 지키는 것: 스크립트는 `.ts` 파일을 그 자리에서 트랜스파일해 실행한다.
// 편한 대신 조용히 깨질 수 있다 — cards.seed.ts 나 CardDraft.ts 가 값(타입이 아닌)
// import 를 하나 새로 들이면 스텁이 그것을 모르고, 결과가 빈 배열이 되거나 필드가
// 통째로 비어 나간다. 그대로 서버에 올리면 카드가 등록은 되는데 내용이 없다.
//
// 그래서 '몇 장인지'가 아니라 **한 장의 내용까지** 확인한다.

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');

function runExport(): Record<string, unknown>[] {
  const out = execFileSync('node', ['scripts/export-cards.mjs'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  return JSON.parse(out);
}

describe('scripts/export-cards.mjs', () => {
  const cards = runExport();

  it('시드 카드를 모두 내보낸다(빈 배열로 통과하는 헛검사 방지)', () => {
    expect(cards.length).toBeGreaterThan(50);
  });

  it('서버가 받는 snake_case 키로 나간다', () => {
    const first = cards[0];
    // 앱 내부 표기(camelCase)가 새어 나가면 서버가 그 필드를 통째로 무시한다.
    expect(first).toHaveProperty('category_cd');
    expect(first).toHaveProperty('question_txt');
    expect(first).toHaveProperty('card_type_cd');
    expect(Object.keys(first).some((k) => /[A-Z]/.test(k))).toBe(false);
  });

  it('내용이 실제로 담긴다 — 빈 껍데기를 올리지 않는다', () => {
    for (const c of cards) {
      expect(String(c.title_txt ?? '')).not.toHaveLength(0);
      expect(String(c.question_txt ?? '')).not.toHaveLength(0);
      expect(String(c.category_cd ?? '')).not.toHaveLength(0);
    }
  });

  it('난이도·형식 코드는 대문자다(서버 코드 규약)', () => {
    for (const c of cards) {
      expect(String(c.difficulty_cd)).toBe(String(c.difficulty_cd).toUpperCase());
      expect(String(c.card_type_cd)).toBe(String(c.card_type_cd).toUpperCase());
    }
  });

  it('OX 카드는 보기 두 개와 정답 위치를 갖는다', () => {
    const ox = cards.filter((c) => c.card_type_cd === 'OX');
    expect(ox.length).toBeGreaterThan(0);
    for (const c of ox) {
      expect(c.choices).toHaveLength(2);
      expect(typeof c.answer_index).toBe('number');
    }
  });

  it('그림 카드가 함께 나간다(그림 등록은 별도라는 전제의 근거)', () => {
    expect(cards.filter((c) => c.image_url).length).toBeGreaterThan(0);
  });
});
