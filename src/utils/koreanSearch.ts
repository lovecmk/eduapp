/**
 * 한국어 친화 검색 매칭 — 설정 검색처럼 "생각나는 대로 두세 글자만 쳐도 찾히는" UX 를 위한 유틸.
 *
 * 지원하는 매칭 방식(우선순위 순으로 점수가 높다):
 *  1) 접두 일치      — "알림" → "알림 받기"
 *  2) 부분 일치      — "크기" → "글자 크기"
 *  3) 초성 일치      — "ㄱㅈㅋㄱ" → "글자 크기"
 *  4) 초성 부분 일치 — "ㅋㄱ"     → "글자 크기"
 *
 * 공백/기호는 무시하므로 "글자크기", "글자 크기" 어느 쪽으로 쳐도 같은 결과가 나온다.
 */

const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
const JUNG_COUNT = 21;
const JONG_COUNT = 28;

/** 완성형 한글의 초성 19자(유니코드 조합 순서). */
const CHOSUNG = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];

/** 검색 비교용 정규화 — 소문자화 + 공백/기호 제거. */
export function normalize(text: string): string {
  return text.toLowerCase().replace(/[\s·,.()[\]{}/\\'"~!?%&+-]/g, '');
}

/** 문자열의 초성열을 만든다. 한글이 아닌 글자는 그대로 둔다. */
export function toChosung(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= HANGUL_BASE && code <= HANGUL_LAST) {
      out += CHOSUNG[Math.floor((code - HANGUL_BASE) / (JUNG_COUNT * JONG_COUNT))];
    } else {
      out += ch;
    }
  }
  return out;
}

/** 질의가 초성만으로 이루어졌는지(ㄱ~ㅎ). 초성 검색을 켤지 판단한다. */
export function isChosungQuery(query: string): boolean {
  const q = normalize(query);
  return q.length > 0 && /^[ㄱ-ㅎ]+$/.test(q);
}

/**
 * 하나의 후보 문자열에 대한 매칭 점수(0 = 불일치, 클수록 좋은 매칭).
 * 검색 결과 정렬에 그대로 쓰인다.
 */
export function matchScore(candidate: string, query: string): number {
  const q = normalize(query);
  if (q.length === 0) return 0;

  const target = normalize(candidate);
  if (target.length === 0) return 0;

  if (target === q) return 100;
  if (target.startsWith(q)) return 80;
  if (target.includes(q)) return 60;

  // 초성 검색 — 질의가 초성만일 때만 적용해, 일반 단어 검색의 오탐을 막는다.
  if (isChosungQuery(q)) {
    const cho = toChosung(target);
    if (cho.startsWith(q)) return 50;
    if (cho.includes(q)) return 35;
  }

  return 0;
}

/**
 * 여러 필드(라벨·설명·키워드 등)를 한꺼번에 평가해 가장 높은 점수를 돌려준다.
 * `weights` 로 필드별 가중치를 줄 수 있다(라벨 일치를 설명 일치보다 위로 올릴 때).
 */
export function bestScore(fields: { text: string; weight?: number }[], query: string): number {
  let best = 0;
  for (const { text, weight = 1 } of fields) {
    const score = matchScore(text, query) * weight;
    if (score > best) best = score;
  }
  return best;
}
