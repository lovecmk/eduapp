/**
 * 안드로이드 하드웨어 뒤로가기 정책.
 *
 * 왜 정책을 따로 두는가 — 뒤로가기는 화면마다 제각각 처리하면 반드시 구멍이 생긴다.
 * 실제로 학습을 마치고 복습으로 이동한 뒤 뒤로가기를 누르면 **앱이 그대로 종료**됐다.
 * 이동에 `replace` 를 써서 스택에 돌아갈 곳이 남지 않았기 때문인데, 사용자 입장에서는
 * "복습 화면에서 뒤로 갔더니 앱이 꺼졌다"로만 보인다. 화면 하나를 고쳐도 같은 형태의
 * 이동이 앱 곳곳에 있어 다시 생긴다.
 *
 * 그래서 규칙을 한 곳에 적어 두고 앱 전체에 같은 규칙을 적용한다.
 *
 *   1. 돌아갈 화면이 있으면 → 돌아간다.
 *   2. 없는데 홈이 아니면 → 홈으로 간다. (앱이 꺼지는 일은 없다)
 *   3. 홈에서 눌렀으면 → 한 번 더 눌러야 나간다. 첫 번째 누름은 안내만 한다.
 *
 * 3번이 중요하다. 홈에서 뒤로가기가 곧바로 종료되면, 주머니 속 오작동이나 습관적인
 * 한 번의 터치로 학습 도중 앱이 꺼진다. 안드로이드 앱의 표준 동작이기도 하다.
 */

/** 뒤로가기를 눌렀을 때 앱이 취할 행동. */
export type BackDecision =
  /** 이전 화면으로 돌아간다. */
  | 'pop'
  /** 돌아갈 곳이 없다 — 홈으로 보낸다(종료하지 않는다). */
  | 'goHome'
  /** 종료 직전 — "한 번 더 누르면 종료" 안내를 띄운다. */
  | 'confirmExit'
  /** 안내 직후 다시 눌렀다 — 종료한다. */
  | 'exit';

/** 두 번째 누름을 '종료 의사'로 인정하는 시간(ms). */
export const EXIT_CONFIRM_WINDOW_MS = 2000;

export interface BackContext {
  /** 네비게이션 스택에 돌아갈 화면이 있는가. */
  canGoBack: boolean;
  /** 지금 홈(탭 최상단)에 있는가. */
  isHome: boolean;
  /** 직전에 '한 번 더 누르면 종료' 안내를 띄운 시각(없으면 null). */
  lastExitPromptAt: number | null;
  /** 현재 시각. */
  now: number;
}

/**
 * 뒤로가기 한 번에 대한 결정을 내린다.
 *
 * 순수 함수로 둔 이유: 이 판단은 안드로이드 기기에서만 재현되는데, 그러면 회귀를
 * 자동으로 잡을 방법이 없다. 판단을 화면에서 떼어 내면 표로 만들어 검증할 수 있다.
 */
export function decideBack(ctx: BackContext): BackDecision {
  if (ctx.canGoBack) return 'pop';
  if (!ctx.isHome) return 'goHome';

  const prompted = ctx.lastExitPromptAt;
  if (prompted !== null && ctx.now - prompted < EXIT_CONFIRM_WINDOW_MS) {
    return 'exit';
  }
  return 'confirmExit';
}

/**
 * 이 경로가 '홈'인가.
 *
 * expo-router 의 pathname 은 같은 화면을 여러 형태로 나타낸다
 * (`/`, `/(tabs)`, `/(tabs)/`, `/(tabs)/index`). 한 가지 형태만 비교하면
 * 나머지 경우에 홈을 홈으로 알아보지 못해, 홈에서도 "홈으로 이동"만 반복하며
 * 영영 앱을 나갈 수 없게 된다.
 */
export function isHomePath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const normalized = pathname.replace(/\/+$/, ''); // 끝 슬래시 제거
  return (
    normalized === '' ||
    normalized === '/' ||
    normalized === '/(tabs)' ||
    normalized === '/(tabs)/index' ||
    normalized === '/index'
  );
}
