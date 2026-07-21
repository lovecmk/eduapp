// 앱 전역 햅틱 파사드 — 촉각 피드백의 단일 진입점.
//
// expo-haptics 는 웹/일부 에뮬레이터에서 예외를 던지거나 미지원이라, 호출부마다
// `if (Platform.OS !== 'web')` 가드와 `.catch(() => {})` 가 흩어져 중복돼 있었다.
// 그 관심사(플랫폼 가드 · 실패 흡수)를 여기 한 곳으로 모아, 화면/컴포넌트는
// "무슨 촉감을 줄지"라는 의도(intent)만 선언하면 되도록 한다.
//
// 원칙: 촉각은 어디까지나 부수효과(side-effect)다. 절대 throw 하지 않고, 실패해도
//       사용자 흐름(상태 전이·네비게이션)을 막지 않는다. 데이터 흐름과 분리된
//       "손끝 레이어"로만 존재한다.
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

// 웹에는 촉각 하드웨어가 없다 — 진입점에서 한 번만 판별해 매 호출의 분기를 없앤다.
const supported = Platform.OS !== 'web';

function run(effect: () => Promise<unknown>): void {
  if (!supported) return;
  // 실패(미지원 기기·권한·에뮬레이터)는 조용히 삼킨다. 촉감이 없다고 흐름이 멈추면 안 된다.
  effect().catch(() => {});
}

/** 가벼운 탭 확인감 — 버튼·칩·아이콘 등 일상적 터치의 "눌렸어요" 신호. */
export const hapticTap = (): void => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));

/** 중간 세기 — 스와이프 임계 통과·카드 뒤집기 등 "확정"되는 순간. */
export const hapticImpact = (): void => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));

/** 선택 변경 — 스위치·세그먼트 등 값이 바뀌는 미세 전환. */
export const hapticSelection = (): void => run(() => Haptics.selectionAsync());

/** 성공 알림 — 정답·획득·완료처럼 긍정적으로 매듭지어지는 결과. */
export const hapticSuccess = (): void =>
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));

/** 주의 알림 — 되돌릴 수 있는 실패·경고(입력 재시도 등). */
export const hapticWarning = (): void =>
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));

/** 오류 알림 — 오답·차단된 동작처럼 단호한 부정 신호. */
export const hapticError = (): void =>
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
