import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { ROUTES } from '../constants/routes';

/**
 * '막다른 길 없는' 뒤로가기.
 *
 * `router.back()` 은 스택에 이전 화면이 있을 때만 동작한다. 그런데 이 앱의 화면들은
 * 스택을 거치지 않고도 열릴 수 있다.
 *  · 웹에서 주소를 직접 입력하거나 링크를 공유받아 들어온 경우
 *  · 알림을 눌러 특정 화면으로 바로 진입한 경우
 *  · 앱이 종료됐다가 그 화면으로 복원된 경우
 *
 * 이때 back() 은 조용히 아무 일도 하지 않고, 사용자는 ← 버튼이 먹통인 화면에 갇힌다.
 * 돌아갈 곳이 없으면 홈(또는 지정한 대체 목적지)으로 보내 항상 빠져나갈 길을 남긴다.
 *
 * @param fallback 돌아갈 화면이 없을 때 이동할 경로. 기본값은 홈.
 */
export function useGoBack(fallback: string = ROUTES.home): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(fallback as never);
  }, [router, fallback]);
}
