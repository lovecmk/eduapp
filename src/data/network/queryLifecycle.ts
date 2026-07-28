import { AppState, Platform, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager } from '@tanstack/react-query';

/**
 * react-query 를 앱의 생명주기·네트워크 상태에 연결한다.
 *
 * react-query 는 원래 웹 기준이라 두 가지를 브라우저에서 읽는다.
 *  · 화면을 보고 있는가  → `document.visibilityState`
 *  · 온라인인가          → `window.navigator.onLine`
 *
 * React Native 에는 둘 다 없다. 연결해 주지 않으면 react-query 는
 * **"언제나 화면을 보고 있고 언제나 온라인"** 이라고 믿는다. 그 결과:
 *
 *  1. `refetchInterval` 이 백그라운드에서도 계속 돈다.
 *     커뮤니티 프레즌스는 15초마다 갱신하는데, 탭을 한 번 열면 그 쿼리는
 *     계속 마운트돼 있으므로 사용자가 앱을 내려도 15초마다 요청이 나간다.
 *     배터리와 데이터를 조용히 태운다.
 *  2. 재접속했을 때 아무 일도 일어나지 않는다.
 *     NetInfo·오프라인 배너·전송 큐는 이미 연결 상태를 알고 있는데
 *     react-query 만 몰라서 `refetchOnReconnect` 가 사실상 죽은 옵션이었다.
 *
 * 여기서 한 번 이어 주면 두 문제가 같이 사라진다.
 *
 * 주의: 이건 '복귀 시 새로고침'(useAppResume)과 역할이 다르다.
 * useAppResume 은 자정을 넘겼는지·오래 비웠는지를 보고 **무엇을 다시 부를지**
 * 정하는 정책이고, 여기는 react-query 에게 **지금이 어떤 상태인지** 알려 줄 뿐이다.
 */
export function startQueryLifecycleBridge(): () => void {
  // 웹에서는 react-query 의 기본 구현(document/navigator)이 이미 정확하다.
  // 여기서 덮어쓰면 오히려 브라우저 탭 전환을 못 읽게 된다.
  if (Platform.OS === 'web') return () => {};

  const onAppStateChange = (status: AppStateStatus) => {
    // 'inactive'(알림센터·통화 오버레이 등)도 보고 있지 않은 상태로 친다.
    focusManager.setFocused(status === 'active');
  };
  const appSub = AppState.addEventListener('change', onAppStateChange);
  focusManager.setFocused(AppState.currentState === 'active');

  // onlineManager.setEventListener 는 반환값이 없다(정리는 내부가 들고 있다).
  // 그래서 NetInfo 구독 해제는 여기서 직접 붙잡아 둔다.
  let netUnsub: (() => void) | undefined;
  onlineManager.setEventListener((setOnline) => {
    netUnsub = NetInfo.addEventListener((state) => {
      // isInternetReachable 은 확인 중일 때 null 이다. 그때 오프라인으로 단정하면
      // 앱을 켜자마자 모든 쿼리가 멈춘다 — 판정이 날 때까지는 isConnected 를 믿는다.
      setOnline(state.isInternetReachable ?? state.isConnected ?? true);
    });
    return netUnsub;
  });

  return () => {
    appSub.remove();
    netUnsub?.();
    // 다음 마운트가 '보고 있지 않음'을 물려받지 않도록 기본값으로 되돌린다.
    focusManager.setFocused(undefined);
  };
}
