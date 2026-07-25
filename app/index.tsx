import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';
import { ROUTES } from '../src/constants/routes';

/**
 * 진입점 라우트 — 복구된 세션 유무에 따라 갈 곳을 정한다.
 *
 * restore() 가 끝나기 전(bootstrapped=false)에는 아무것도 렌더하지 않는다.
 * 여기서 세션을 보지 않고 무조건 로그인으로 보내면, 저장된 세션이 있는 사용자도
 * 앱을 열 때마다 다시 로그인해야 하고 웹에서는 새로고침·딥링크마다 로그인으로 튕긴다.
 */
export default function Index() {
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const user = useAuthStore((s) => s.user);

  if (!bootstrapped) return null;

  return <Redirect href={user ? ROUTES.home : ROUTES.login} />;
}
