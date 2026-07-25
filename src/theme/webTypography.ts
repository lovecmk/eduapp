import { Platform } from 'react-native';

/**
 * 웹 전용 한글 줄바꿈 교정.
 *
 * 문제: 브라우저 기본 줄바꿈은 한글을 '음절 단위'로 끊을 수 있어, 좁은 폭에서
 *      "퍼즐 맞추듯 오 / 늘도 톡톡" 처럼 **단어 중간**에서 잘린다.
 *      (네이티브 iOS/Android 텍스트 엔진은 어절 단위로 끊어 이 현상이 없다 —
 *       그래서 웹에서만 보이는 렌더링 차이였다.)
 *
 * 해결: word-break: keep-all → 한글 단어(어절) 중간에서 끊지 않는다.
 *      다만 이것만 주면 띄어쓰기 없는 아주 긴 문자열(URL·연속 문자)이 컨테이너를
 *      비집고 나가므로, overflow-wrap: break-word 로 그런 경우만 예외적으로 끊는다.
 *
 * 두 속성 모두 상속되므로 :root 한 곳에만 선언하면 앱 전체에 적용된다.
 */
const CSS = `:root { word-break: keep-all; overflow-wrap: break-word; }`;

const STYLE_ID = 'app-web-typography';

/** 웹에서 한 번만 전역 스타일을 주입한다(네이티브에서는 아무 일도 하지 않음). */
export function applyWebTypography(): void {
  if (Platform.OS !== 'web') return;
  if (typeof document === 'undefined') return; // SSR/프리렌더 안전장치
  if (document.getElementById(STYLE_ID)) return; // 중복 주입 방지

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
