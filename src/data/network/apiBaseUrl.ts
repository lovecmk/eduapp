/**
 * 서버 주소 해석 — `EXPO_PUBLIC_API_BASE_URL` 하나를 어떻게 읽을 것인가.
 *
 * env.ts 에서 떼어 둔 이유는 두 가지다.
 *  · 순수 함수라 값을 넣어 가며 검사할 수 있다. env.ts 는 `EXPO_PUBLIC_*` 를 읽는데,
 *    그 값은 번들러가 **빌드 타임에 문자열로 박아 넣는다** — 테스트가 런타임에
 *    process.env 를 바꿔도 아무 일도 일어나지 않는다.
 *  · 주소를 다루는 규칙이 한곳에 모인다.
 */

/**
 * 앱의 모든 API 경로가 이미 달고 있는 접두사.
 *
 * 접두사는 **경로 쪽에 있다**(repositories/* 의 '/inner/api/v1/...'). 그러니 서버
 * 주소에는 도메인까지만 넣어야 한다.
 */
export const API_PREFIX = '/inner/api/v1';

export interface ResolvedBaseUrl {
  /** 실제로 요청에 쓸 주소. */
  url: string;
  /** 받은 값을 고쳐 썼다면 무엇을 고쳤는지. 정상이면 빈 문자열. */
  note: string;
}

/**
 * 서버 주소를 정규화한다. 사람이 손으로 넣는 값이라 두 가지가 반복해서 어긋난다.
 *
 * 1) 끝의 '/' — `https://도메인/` 이면 요청 경로가 `//inner/...` 로 시작한다.
 *
 * 2) **접두사 중복** — 프록시 안내문에는 보통 `https://도메인/inner/api/v1` 이 적혀
 *    있는데, 앱 경로에는 그 접두사가 이미 박혀 있다. 그대로 넣으면 요청이
 *    `/inner/api/v1/inner/api/v1/...` 가 되어 **모든 엔드포인트가 404** 다.
 *
 *    이 실패는 조용하다. 폴백이 걸린 기능은 목업으로 내려가 화면이 멀쩡히 돌고
 *    핵심 기능만 알 수 없는 오류를 낸다 — 주소 한 줄이 원인이라고 짚기까지 한참
 *    걸린다. 그래서 틀린 값을 받아도 동작하도록 잘라내되, 잘랐다는 사실을 남겨
 *    설정 자체를 고칠 수 있게 한다(조용히 고쳐 주기만 하면 .env 는 영영 틀린 채다).
 */
export function resolveApiBaseUrl(raw: string): ResolvedBaseUrl {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return { url: '', note: '' };

  if (trimmed.toLowerCase().endsWith(API_PREFIX)) {
    return {
      url: trimmed.slice(0, -API_PREFIX.length).replace(/\/+$/, ''),
      note: `${API_PREFIX} 접두사가 중복되어 잘라냄`,
    };
  }
  return { url: trimmed, note: trimmed !== raw.trim() ? "끝의 '/' 를 잘라냄" : '' };
}

export type ServerKind = 'production' | 'test' | 'mock' | 'other';

/** 호스트명만 뽑는다(스킴·포트·경로 제거). */
function hostOf(url: string): string {
  return url.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0].toLowerCase();
}

/**
 * 이 번들이 보는 서버의 성격 — 개발자 화면이 한 줄로 말해 준다.
 *
 * 주소만 봐서는 '어느 서버인지'가 곧바로 읽히지 않는다. 빌드를 어느 프로필로 떴는지는
 * 앱 안에서 알 방법이 없어서, 이 줄이 없으면 개발자 화면을 볼 때마다
 * "왜 테스트 주소지?" 를 다시 묻게 된다.
 */
export function describeServer(url: string): { kind: ServerKind; label: string } {
  if (!url) return { kind: 'mock', label: '없음 · 목업으로 도는 빌드 (저장되지 않음)' };
  const host = hostOf(url);
  if (host === 'bridge.kfpa.or.kr') return { kind: 'production', label: '운영 (bridge.kfpa.or.kr)' };
  if (host === 'test.inplat.org') {
    return { kind: 'test', label: '테스트 (test.inplat.org · 사내망 전용)' };
  }
  return { kind: 'other', label: `기타 (${url})` };
}
