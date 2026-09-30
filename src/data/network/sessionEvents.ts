/**
 * 서버가 이 세션을 더 이상 받아 주지 않는다는 신호 — ApiClient → authStore.
 *
 * ── 왜 필요한가 ─────────────────────────────────────────────────────────────
 * ApiClient 는 401 을 받으면 refresh 를 한 번 시도하고, 그것도 실패하면 토큰을
 * 지운 뒤 401 을 던진다. 그런데 **화면의 로그인 상태(authStore.user)는 그대로
 * 남아 있었다.** 앱을 쓰는 도중에 refresh 토큰이 만료되면(또는 관리자가 세션을
 * 끊으면) 사용자는 여전히 로그인된 화면을 보면서, 누르는 것마다 "인증이
 * 만료되었습니다" 오류만 받는다. 로그아웃 버튼을 스스로 찾아 누르기 전까지는
 * 다시 로그인할 길이 화면에 없다.
 *
 * 저장소 계층(ApiClient)이 스토어를 직접 부르면 계층이 거꾸로 선다. 그래서 여기
 * 한 곳에 '끝났다'는 사실만 알리고, 무엇을 할지는 authStore 가 정한다.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

/** 세션이 서버에 의해 끝났을 때 불릴 함수를 건다. 반환값으로 해제한다. */
export function onSessionExpired(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** ApiClient 전용 — refresh 까지 실패해 토큰을 지운 직후 부른다. */
export function emitSessionExpired(): void {
  for (const l of [...listeners]) {
    try {
      l();
    } catch {
      // 듣는 쪽의 실패가 요청 실패(401)의 전달을 막아서는 안 된다.
    }
  }
}
