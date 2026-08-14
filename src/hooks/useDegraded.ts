import { useCallback, useSyncExternalStore } from 'react';
import { isDegraded, subscribeDegradations } from '../data/repositories/_fallback';

/**
 * 이 기능이 지금 목업으로 돌고 있는가 — 즉 서버가 아니라 이 기기 안에서 도는가.
 *
 * 폴백은 화면이 깨지지 않게 해 주지만, **조용한 폴백은 거짓말이 될 수 있다.**
 * 질문 & 답변이 그렇다. 서버에 라우트가 없는 동안 올린 질문은 이 기기에만 남는데,
 * 화면이 여느 때와 똑같으면 사용자는 동료들이 읽고 있다고 믿는다. 나중에 아무 답도
 * 달리지 않은 것을 보고 "이 회사는 아무도 안 보는구나"로 읽는다 — 실제로는 애초에
 * 아무에게도 가지 않았다.
 *
 * 그래서 강등 사실을 화면까지 끌어올린다. 라벨은 repositories/index.ts 가 넘긴 것과
 * 같아야 한다('qna' · 'settings' · 'weather' …).
 */
export function useDegraded(label: string): boolean {
  const getSnapshot = useCallback(() => isDegraded(label), [label]);
  return useSyncExternalStore(subscribeDegradations, getSnapshot, getSnapshot);
}
