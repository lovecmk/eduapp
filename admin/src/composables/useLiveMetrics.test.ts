import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent, h, createApp, type App } from 'vue';
import { api } from '../api/client';
import { useLiveMetrics, __subscriberCount } from './useLiveMetrics';

/**
 * 이 검사가 지키는 것: **화면 몇 개가 보든 SSE 연결은 하나.**
 *
 * 상단 바가 연결 상태를 상시 표시하므로, 대시보드를 열면 구독자가 둘이 된다.
 * 예전처럼 호출할 때마다 스트림을 열면 같은 데이터를 두 번 받으려고 서버 자원을
 * 두 배로 쓰게 된다. 눈으로는 절대 안 보이는 회귀라 검사로 못박는다.
 */

type Handle = { app: App; state: ReturnType<typeof useLiveMetrics> };

/** useLiveMetrics 만 쓰는 최소한의 컴포넌트를 띄우고, 반환값을 함께 넘긴다. */
function mount(): Handle {
  let state!: ReturnType<typeof useLiveMetrics>;
  const Comp = defineComponent({
    setup() {
      state = useLiveMetrics();
      return () => h('div');
    },
  });
  const app = createApp(Comp);
  app.mount(document.createElement('div'));
  return { app, state };
}

/** 스트림을 닫는 함수 자리. openStream 의 반환 타입(() => void)과 맞춰 둔다. */
const makeClose = () => vi.fn((): void => {});

let closeSpy: ReturnType<typeof makeClose>;
let openSpy: ReturnType<typeof vi.spyOn>;
/** 스트림이 상태 변화를 알릴 때 부르는 콜백 — 끊김을 흉내 내려고 잡아 둔다. */
let notifyState: ((live: boolean) => void) | undefined;

beforeEach(() => {
  notifyState = undefined;
  closeSpy = makeClose();
  openSpy = vi.spyOn(api, 'openStream').mockImplementation((_onSnapshot, onStateChange) => {
    notifyState = onStateChange;
    return closeSpy;
  });
});

afterEach(() => {
  openSpy.mockRestore();
  // 구독자가 새면 다음 검사가 오염된다.
  expect(__subscriberCount()).toBe(0);
});

describe('useLiveMetrics — 연결 공유', () => {
  it('구독자가 둘이어도 스트림은 한 번만 연다', () => {
    const a = mount();
    const b = mount();

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(__subscriberCount()).toBe(2);

    a.app.unmount();
    b.app.unmount();
  });

  it('마지막 구독자가 사라질 때만 연결을 닫는다', () => {
    const a = mount();
    const b = mount();

    a.app.unmount();
    // 아직 상단 바가 남아 있다 — 여기서 닫으면 표시등이 죽는다.
    expect(closeSpy).not.toHaveBeenCalled();

    b.app.unmount();
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('전부 닫혔다가 다시 열리면 새 연결을 연다', () => {
    // 로그아웃 → 재로그인 경로. 닫힌 연결을 재사용하면 화면이 영영 멈춘다.
    const a = mount();
    a.app.unmount();
    expect(closeSpy).toHaveBeenCalledTimes(1);

    const b = mount();
    expect(openSpy).toHaveBeenCalledTimes(2);
    b.app.unmount();
  });

  it('구독자들이 같은 상태를 본다', () => {
    const a = mount();
    const b = mount();

    notifyState?.(true);
    expect(a.state.live.value).toBe(true);
    // 연결은 하나이므로 두 화면이 같은 사실을 말해야 한다.
    // 둘의 표시가 어긋나는 순간 사용자는 둘 다 못 믿는다.
    expect(b.state.live.value).toBe(true);

    a.app.unmount();
    b.app.unmount();
  });

  it('연결이 끊기면 live 가 false 로 떨어진다', () => {
    // 화면이 멈췄는데 사용자가 그걸 모르면 옛 숫자를 현재로 착각한다.
    const a = mount();

    notifyState?.(true);
    expect(a.state.live.value).toBe(true);

    notifyState?.(false);
    expect(a.state.live.value).toBe(false);

    a.app.unmount();
  });

  it('마지막 구독자가 떠나면 이전 세션의 값이 남지 않는다', () => {
    const a = mount();
    notifyState?.(true);

    a.app.unmount();
    // 로그아웃 뒤 다음 로그인 화면에 옛 숫자가 잠깐 비치면 안 된다.
    expect(a.state.live.value).toBe(false);
    expect(a.state.snapshot.value).toBeNull();
    expect(a.state.lastUpdate.value).toBeNull();
  });
});
