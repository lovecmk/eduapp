import { AppState, Platform, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager } from '@tanstack/react-query';

import { startQueryLifecycleBridge } from '../queryLifecycle';

// react-query 는 웹 기준이라 RN 에서는 '항상 포커스, 항상 온라인'으로 굳는다.
// 그 상태에서는 주기 갱신이 백그라운드에서도 계속 돈다 — 여기서 그걸 막는지 본다.

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(() => jest.fn()) },
}));

type AppStateHandler = (s: AppStateStatus) => void;

function mountBridge(): { fire: AppStateHandler; stop: () => void; remove: jest.Mock } {
  let handler: AppStateHandler = () => {};
  const remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    handler = listener as AppStateHandler;
    return { remove } as never;
  });
  const stop = startQueryLifecycleBridge();
  return { fire: (s) => handler(s), stop, remove };
}

describe('startQueryLifecycleBridge', () => {
  const realOS = Platform.OS;

  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    (AppState as { currentState: string }).currentState = 'active';
    jest.clearAllMocks();
  });

  afterEach(() => {
    focusManager.setFocused(undefined);
    Object.defineProperty(Platform, 'OS', { value: realOS, configurable: true });
    jest.restoreAllMocks();
  });

  it('백그라운드로 나가면 포커스를 잃었다고 알린다', () => {
    // 이걸 알려 주지 않으면 refetchInterval 이 앱을 내려도 계속 돈다.
    const { fire, stop } = mountBridge();
    fire('background');
    expect(focusManager.isFocused()).toBe(false);
    stop();
  });

  it('돌아오면 다시 포커스를 얻었다고 알린다', () => {
    const { fire, stop } = mountBridge();
    fire('background');
    fire('active');
    expect(focusManager.isFocused()).toBe(true);
    stop();
  });

  it("iOS 의 'inactive' 도 보고 있지 않은 상태로 친다", () => {
    // 알림센터를 내리거나 전화가 오면 화면은 가려진다.
    const { fire, stop } = mountBridge();
    fire('inactive');
    expect(focusManager.isFocused()).toBe(false);
    stop();
  });

  it('연결 상태를 NetInfo 에서 받아 온라인 판정에 쓴다', () => {
    const { stop } = mountBridge();
    const listener = (NetInfo.addEventListener as jest.Mock).mock.calls[0]?.[0];
    expect(listener).toBeDefined();

    listener({ isConnected: false, isInternetReachable: false });
    expect(onlineManager.isOnline()).toBe(false);

    listener({ isConnected: true, isInternetReachable: true });
    expect(onlineManager.isOnline()).toBe(true);
    stop();
  });

  it('연결 확인 중(null)에는 오프라인으로 단정하지 않는다', () => {
    // isInternetReachable 은 판정 전 null 이다. 그때 끊겼다고 보면
    // 앱을 켜자마자 모든 쿼리가 멈춘다.
    const { stop } = mountBridge();
    const listener = (NetInfo.addEventListener as jest.Mock).mock.calls[0]?.[0];
    listener({ isConnected: true, isInternetReachable: null });
    expect(onlineManager.isOnline()).toBe(true);
    stop();
  });

  it('정리하면 구독을 해제한다', () => {
    const { stop, remove } = mountBridge();
    stop();
    expect(remove).toHaveBeenCalled();
  });

  it('웹에서는 손대지 않는다 — 브라우저 기본 구현이 이미 정확하다', () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    const spy = jest.spyOn(AppState, 'addEventListener');
    const stop = startQueryLifecycleBridge();
    expect(spy).not.toHaveBeenCalled();
    stop();
  });
});
