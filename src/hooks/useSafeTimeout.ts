import { useCallback, useEffect, useRef } from 'react';

/**
 * 언마운트 안전 타이머.
 *
 * RN/React 에서 흔한 사고 패턴:
 *   setTimeout(() => setState(...), 900)
 * 사용자가 그 900ms 안에 뒤로 가기·탭 전환을 하면 이미 사라진 컴포넌트의
 * setState 가 호출된다. 개발 중엔 경고로 끝나지만, 애니메이션·모달 리셋처럼
 * 반복되는 자리에선 타이머가 계속 쌓여 메모리와 배터리를 갉아먹고,
 * 화면 전환 직후 엉뚱한 상태로 되돌아가는 버그로도 나타난다.
 *
 * 이 훅은 예약된 타이머를 전부 기억해두었다가 언마운트 시 한꺼번에 정리한다.
 * 호출부는 `run(fn, ms)` 만 쓰면 되고 clear 를 신경 쓸 필요가 없다.
 */
export function useSafeTimeout() {
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current.clear();
    },
    [],
  );

  /** ms 뒤에 fn 을 실행한다. 그 전에 언마운트되면 실행되지 않는다. */
  const run = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
    return id;
  }, []);

  /** 예약된 타이머를 즉시 모두 취소한다(예: 사용자가 직접 다음 단계로 넘어갔을 때). */
  const cancelAll = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
  }, []);

  return { run, cancelAll };
}

/**
 * 아직 화면에 붙어 있는지 알려주는 판별기.
 *
 * `await` 가 끼어 있는 핸들러(전송 → 서버 응답 → 상태 갱신)에서는 타이머와
 * 똑같은 문제가 생긴다. 응답을 기다리는 사이 사용자가 화면을 떠날 수 있다.
 * setState 앞에 `if (!alive()) return;` 한 줄로 막는다.
 */
export function useIsMounted(): () => boolean {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return useCallback(() => mounted.current, []);
}
