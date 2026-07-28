import { QueryClient } from '@tanstack/react-query';

/**
 * 앱 전역 react-query 클라이언트.
 *
 * 왜 화면(_layout.tsx)이 아니라 여기 있는가:
 * 서버 응답 캐시는 **세션에 종속된 데이터**다. 로그아웃/계정 전환 때 반드시 함께
 * 비워야 하는데, 클라이언트가 화면 모듈 안의 지역 상수로 숨어 있으면 그걸 비우는
 * 책임이 화면마다 흩어진다 — 실제로 설정 화면의 로그아웃만 `queryClient.clear()`
 * 를 부르고, 헤더 메뉴의 로그아웃은 부르지 않아 다음 사람이 앞사람의 프로필·통계
 * 캐시를 그대로 보게 되어 있었다.
 *
 * 세션 정리(store/sessionScope)가 한 곳에서 이 인스턴스를 비우게 해서
 * "로그아웃 경로를 새로 만들면 캐시 비우기를 잊는" 구조적 결함을 없앤다.
 */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});
