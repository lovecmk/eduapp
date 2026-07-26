import React from 'react';
import { Text } from 'react-native';
import { render, act } from '@testing-library/react-native';
import { useSafeTimeout, useIsMounted } from '../useSafeTimeout';

/**
 * 언마운트 안전 타이머 — "사용자가 애니메이션/전송이 끝나기 전에 화면을 떠난다"는
 * 아주 흔한 상황에서 예약된 콜백이 실행되지 않아야 한다.
 */
describe('useSafeTimeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function Probe({ onFire, ms = 1000 }: { onFire: () => void; ms?: number }) {
    const { run } = useSafeTimeout();
    React.useEffect(() => { run(onFire, ms); }, [run, onFire, ms]);
    return <Text>probe</Text>;
  }

  it('마운트 상태면 예약한 콜백이 실행된다', () => {
    const fire = jest.fn();
    render(<Probe onFire={fire} />);
    act(() => { jest.advanceTimersByTime(1000); });
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it('언마운트되면 예약된 콜백이 실행되지 않는다(사라진 화면의 setState 방지)', () => {
    const fire = jest.fn();
    const { unmount } = render(<Probe onFire={fire} />);
    act(() => { jest.advanceTimersByTime(500); }); // 아직 도달 전에 화면을 떠남
    unmount();
    act(() => { jest.advanceTimersByTime(5000); });
    expect(fire).not.toHaveBeenCalled();
  });

  it('cancelAll 로 예약을 즉시 취소할 수 있다', () => {
    const fire = jest.fn();
    function CancelProbe() {
      const { run, cancelAll } = useSafeTimeout();
      React.useEffect(() => { run(fire, 300); cancelAll(); }, [run, cancelAll]);
      return <Text>probe</Text>;
    }
    render(<CancelProbe />);
    act(() => { jest.advanceTimersByTime(1000); });
    expect(fire).not.toHaveBeenCalled();
  });

  it('여러 타이머를 예약해도 언마운트 시 전부 정리된다', () => {
    const fire = jest.fn();
    function MultiProbe() {
      const { run } = useSafeTimeout();
      React.useEffect(() => { run(fire, 100); run(fire, 200); run(fire, 300); }, [run]);
      return <Text>probe</Text>;
    }
    const { unmount } = render(<MultiProbe />);
    act(() => { jest.advanceTimersByTime(150); }); // 첫 타이머만 발화
    expect(fire).toHaveBeenCalledTimes(1);
    unmount();
    act(() => { jest.advanceTimersByTime(1000); });
    expect(fire).toHaveBeenCalledTimes(1); // 나머지 둘은 취소됨
  });
});

describe('useIsMounted', () => {
  it('마운트 중에는 true, 언마운트 후에는 false 를 돌려준다', () => {
    let alive: (() => boolean) | null = null;
    function Probe() {
      alive = useIsMounted();
      return <Text>probe</Text>;
    }
    const { unmount } = render(<Probe />);
    expect(alive!()).toBe(true);
    unmount();
    expect(alive!()).toBe(false);
  });
});
