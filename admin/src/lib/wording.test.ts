import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 화면에 나가는 말 검사.
 *
 * 이 콘솔을 실제로 쓰는 사람은 데이터 분석가가 아니라 인사·교육 담당자다.
 * 분석 쪽에서 자연스러운 말이 그 사람에게는 벽이 되고, 벽이 하나라도 있으면
 * 그 화면은 안 쓰이게 된다.
 *
 * 서버 쪽에도 같은 검사가 있다(backend/internal/service/wording_test.go).
 * 문장은 두 곳에서 만들어지므로 검사도 두 곳에 있어야 한다 — 한쪽만 지키면
 * 화면에서 두 어투가 섞이고, 그게 어려운 말 하나보다 나쁘다.
 */

/** 쓰지 않기로 한 말과, 대신 쓸 말. */
const banned: Record<string, string> = {
  또래: '다른 직원',
  '%p': '%포인트',
  표본: '기록',
  실패율: '틀린 비율',
  숙달률: '익힌 비율',
  코호트: '가입 주',
  리텐션: '잔존',
  퍼널: '단계별 이탈',
  간격반복: '복습',
  학습자: '직원',
};

/** 검사 대상은 사람이 읽는 텍스트가 들어 있는 파일. */
const roots = ['src/views', 'src/components'];

function vueFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...vueFiles(full));
    else if (name.endsWith('.vue')) out.push(full);
  }
  return out;
}

/**
 * 주석과 <style> 블록을 걷어 낸다.
 *
 * 코드 주석에는 '또래 비교'처럼 개념을 설명하는 말이 남아 있어도 된다 —
 * 그건 다음에 이 코드를 읽을 사람에게 하는 말이지 화면에 나가는 말이 아니다.
 * 걷어 내지 않으면 주석을 못 쓰게 되고, 그러면 이유가 사라진다.
 */
function userFacingOnly(src: string): string {
  return src
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('화면에 나가는 말', () => {
  const files = roots.flatMap(vueFiles);

  it('검사할 파일을 실제로 찾는다', () => {
    // 경로가 어긋나면 0개를 검사하고 조용히 통과한다.
    expect(files.length).toBeGreaterThan(8);
  });

  for (const file of files) {
    it(`${file.replace('src/', '')} 에 어려운 말이 없다`, () => {
      const text = userFacingOnly(readFileSync(file, 'utf8'));
      const found: string[] = [];
      for (const [word, instead] of Object.entries(banned)) {
        if (text.includes(word)) found.push(`${word} → ${instead}`);
      }
      expect(found).toEqual([]);
    });
  }
});
