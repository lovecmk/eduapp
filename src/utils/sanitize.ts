// 사용자 입력 정제 — 프론트에서 안전하게 다듬어 백엔드(MongoDB 등)에 깨끗한 값이 저장되게 한다.
// MongoDB(BSON)는 임의 문자열을 저장할 수 있지만, 제어문자·과도한 공백·초장문은
// 표시 깨짐·저장 낭비·주입성 혼란을 유발하므로 입력 단계에서 정규화한다.

export interface SanitizeOptions {
  maxLength?: number;
  allowNewlines?: boolean;
  /** 연속 공백/개행 축약 여부 */
  collapse?: boolean;
}

// 제로폭/방향 제어 문자(zero-width, BOM, LRM/RLM, LRE~RLO, isolates)
const INVISIBLE = new RegExp('[\\u200B-\\u200D\\uFEFF\\u200E\\u200F\\u202A-\\u202E\\u2066-\\u2069]', 'g');
// 제어문자 제거(탭=U+0009, 개행=U+000A, \r=U+000D 은 보존), C1 제어(U+0080-009F) 포함
const CONTROL = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F]', 'g');

/** 유니코드 그래프임 단위 길이(이모지·결합문자 안전). */
export function textLength(s: string): number {
  return Array.from(s).length;
}

/** 그래프임 단위로 안전하게 자른다. */
export function truncateGraphemes(s: string, max: number): string {
  const arr = Array.from(s);
  return arr.length <= max ? s : arr.slice(0, max).join('');
}

/**
 * 입력 문자열을 정제한다.
 *  - 유니코드 NFC 정규화
 *  - 제어문자·제로폭 문자 제거(탭·개행은 보존)
 *  - 개행 비허용 시 공백으로 치환, 허용 시 3연속+ 개행은 2개로 축약
 *  - 연속 공백 축약, 앞뒤 공백 제거, 최대 길이 컷
 */
export function sanitizeText(input: string, opts: SanitizeOptions = {}): string {
  const { maxLength, allowNewlines = false, collapse = true } = opts;
  let s = (input ?? '').normalize('NFC');

  s = s.replace(INVISIBLE, '').replace(CONTROL, '');

  if (!allowNewlines) {
    s = s.replace(/[\r\n]+/g, ' ');
  } else {
    s = s.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  }

  if (collapse) s = s.replace(/[ \t]{2,}/g, ' ');

  s = s.trim();
  if (maxLength && maxLength > 0) s = truncateGraphemes(s, maxLength);
  return s;
}

/** 의미 있는 입력인지(공백/특수문자만 있는 값 방지). */
export function isMeaningful(input: string, minLength = 2): boolean {
  const cleaned = sanitizeText(input, { allowNewlines: true });
  const hasWord = /[\p{L}\p{N}]/u.test(cleaned);
  return hasWord && textLength(cleaned) >= minLength;
}

/** 입력 길이 제한(컨텍스트별 권장값). */
export const INPUT_LIMITS = {
  tip: 140,
  reportDetail: 300,
  supportMessage: 1000,
  email: 254,
} as const;
