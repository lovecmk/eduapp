import { useCallback, useState } from 'react';

import { useIsMounted } from './useSafeTimeout';

/**
 * 아래로 당겨 새로고침 — 스피너가 '깜빡'하지 않게 다듬은 버전.
 *
 * 그냥 refetch 만 연결하면 캐시가 살아 있을 때 응답이 즉시 돌아와 스피너가
 * 한 프레임 만에 사라진다. 사용자 눈에는 **아무 일도 일어나지 않은 것처럼** 보여서
 * 다시 당기게 되고, "새로고침이 안 되네"라는 인상이 남는다.
 *
 * 그래서 최소 표시 시간을 둔다. 실제로는 이미 끝났더라도 잠깐은 돌아가는 것을 보여 준다.
 * 반대로 오래 걸리는 요청은 그대로 기다린다 — 최소값이지 고정값이 아니다.
 */
const MIN_SPINNER_MS = 450;

export function usePullToRefresh(refetch: () => Promise<unknown> | unknown) {
  const [refreshing, setRefreshing] = useState(false);
  const isMounted = useIsMounted();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const startedAt = Date.now();
    try {
      await refetch();
    } catch {
      // 실패는 화면의 오류 표시가 맡는다. 여기서 삼키는 이유는,
      // 당김 제스처가 예외로 끝나면 스피너가 영영 돌아가기 때문이다.
    } finally {
      const elapsed = Date.now() - startedAt;
      const wait = Math.max(0, MIN_SPINNER_MS - elapsed);
      setTimeout(() => {
        // 새로고침 도중 화면을 떠났을 수 있다 — 사라진 화면에 상태를 쓰지 않는다.
        if (isMounted()) setRefreshing(false);
      }, wait);
    }
  }, [refetch, isMounted]);

  return { refreshing, onRefresh };
}
