import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import { ROUTES } from '../constants/routes';

/**
 * 로그인하지 않은 채로 열려도 되는 화면 — 경로의 첫 마디로 판단한다.
 *
 *  · (auth) — 로그인·가입·비밀번호 찾기.
 *  · legal  — 약관·개인정보 처리방침. 가입 전에 읽을 수 있어야 동의가 성립한다.
 *
 * 진입점(index)은 여기 없다. 그 화면은 스스로 세션을 보고 갈 곳을 정한다.
 */
const PUBLIC_SEGMENTS = new Set(['(auth)', 'legal']);

/**
 * 지금 화면에서 로그인 화면으로 돌려보내야 하는가.
 *
 * ── 왜 가드가 필요한가 ──────────────────────────────────────────────────────
 * 앱의 모든 화면은 '로그인한 사람'을 전제로 그려진다. 그런데 그것을 확인하는
 * 곳이 진입점(app/index) 하나뿐이었다. 그 밖의 경로로 들어오면 아무도 막지 않았다:
 *  · 웹에서 /cards 같은 주소를 새로고침하거나 딥링크로 열면 로그아웃 상태로 탭이 열렸다.
 *  · 쓰는 도중 서버가 세션을 끊어도(sessionEvents) 화면은 그대로 남아 오류만 냈다.
 *  · 로그인 화면의 '생체인증으로 로그인'은 세션 없이 홈으로 보내고 있었다.
 * 셋 다 "로그인하지 않은 사람이 로그인한 사람의 화면을 본다"는 같은 결함이다.
 */
export function needsLoginRedirect(segments: readonly string[], signedIn: boolean): boolean {
  if (signedIn) return false;
  const first = segments[0];
  if (first === undefined) return false;
  return !PUBLIC_SEGMENTS.has(first);
}

/** 루트 레이아웃 전용 — 세션이 없는데 보호된 화면에 있으면 로그인 화면으로 보낸다. */
export function useAuthGuard(): void {
  const segments = useSegments();
  const router = useRouter();
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const signedIn = useAuthStore((s) => !!s.user);

  useEffect(() => {
    // 세션 복구가 끝나기 전에는 판단하지 않는다 — 저장된 세션이 있는 사람까지 튕긴다.
    if (!bootstrapped) return;
    if (needsLoginRedirect(segments, signedIn)) router.replace(ROUTES.login as never);
  }, [bootstrapped, signedIn, segments, router]);
}
