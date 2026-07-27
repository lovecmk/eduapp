import { renderHook, act } from '@testing-library/react-native';

import { usePullToRefresh } from '../usePullToRefresh';

// 당김 새로고침의 어려운 부분은 '언제 스피너를 멈추느냐'다.
// 즉시 멈추면 아무 일도 없었던 것처럼 보이고, 안 멈추면 영영 돌아간다.

describe('usePullToRefresh', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('응답이 즉시 와도 스피너를 잠깐은 보여 준다', async () => {
    // 캐시가 살아 있으면 refetch 가 한 프레임 만에 끝난다. 그대로 멈추면
    // 사용자는 아무것도 못 보고 "새로고침이 안 되네"라고 느낀다.
    const { result } = renderHook(() => usePullToRefresh(() => Promise.resolve()));

    await act(async () => {
      void result.current.onRefresh();
    });
    expect(result.current.refreshing).toBe(true);

    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(result.current.refreshing).toBe(false);
  });

  it('오래 걸리는 요청은 끝날 때까지 기다린다', async () => {
    // 최소 표시 시간은 '최소'지 '고정'이 아니다 — 느린 응답을 잘라내면 안 된다.
    let resolve!: () => void;
    const slow = new Promise<void>((r) => {
      resolve = r;
    });
    const { result } = renderHook(() => usePullToRefresh(() => slow));

    await act(async () => {
      void result.current.onRefresh();
    });
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(result.current.refreshing).toBe(true);

    await act(async () => {
      resolve();
      await slow;
      jest.advanceTimersByTime(500);
    });
    expect(result.current.refreshing).toBe(false);
  });

  it('요청이 실패해도 스피너가 멈춘다', async () => {
    // 예외로 끝나면 스피너가 영영 돌아간다 — 화면이 고장 난 것처럼 보인다.
    const { result } = renderHook(() =>
      usePullToRefresh(() => Promise.reject(new Error('네트워크 끊김'))),
    );

    await act(async () => {
      void result.current.onRefresh();
    });
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(result.current.refreshing).toBe(false);
  });

  it('화면을 떠난 뒤에는 상태를 건드리지 않는다', async () => {
    // 사라진 화면에 setState 하면 경고가 뜨고, 심하면 누수가 된다.
    const { result, unmount } = renderHook(() => usePullToRefresh(() => Promise.resolve()));

    await act(async () => {
      void result.current.onRefresh();
    });
    unmount();

    expect(() => {
      act(() => {
        jest.advanceTimersByTime(500);
      });
    }).not.toThrow();
  });
});
