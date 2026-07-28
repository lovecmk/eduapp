import {
  decideBack,
  isHomePath,
  EXIT_CONFIRM_WINDOW_MS,
  type BackContext,
} from '../backPolicy';
import { endFlow } from '../flow';
import { ROUTES } from '../../constants/routes';

// 이 판단은 실제 안드로이드 기기에서만 재현되는데, 그러면 회귀를 자동으로 잡을
// 방법이 없다. 화면에서 떼어 낸 덕에 여기서 표로 검증할 수 있다.

const ctx = (over: Partial<BackContext> = {}): BackContext => ({
  canGoBack: false,
  isHome: false,
  lastExitPromptAt: null,
  now: 1_000_000,
  ...over,
});

describe('decideBack', () => {
  it('돌아갈 화면이 있으면 돌아간다', () => {
    expect(decideBack(ctx({ canGoBack: true }))).toBe('pop');
    // 홈이든 아니든 스택이 우선한다.
    expect(decideBack(ctx({ canGoBack: true, isHome: true }))).toBe('pop');
  });

  it('돌아갈 곳이 없고 홈이 아니면 앱을 끄지 않고 홈으로 보낸다', () => {
    // 이것이 신고된 버그의 핵심이다 — 학습 완료 후 복습으로 이동하면 스택이 비어
    // 뒤로가기가 곧바로 앱을 종료시켰다.
    expect(decideBack(ctx({ canGoBack: false, isHome: false }))).toBe('goHome');
  });

  it('홈에서 처음 누르면 종료하지 않고 안내만 한다', () => {
    expect(decideBack(ctx({ isHome: true }))).toBe('confirmExit');
  });

  it('안내 직후 다시 누르면 종료한다', () => {
    const now = 1_000_000;
    expect(
      decideBack(ctx({ isHome: true, lastExitPromptAt: now - 500, now })),
    ).toBe('exit');
  });

  it('안내가 만료된 뒤에 누르면 다시 안내부터 한다', () => {
    const now = 1_000_000;
    expect(
      decideBack(
        ctx({ isHome: true, lastExitPromptAt: now - EXIT_CONFIRM_WINDOW_MS - 1, now }),
      ),
    ).toBe('confirmExit');
  });

  it('경계값 — 창이 정확히 끝나는 순간은 종료로 인정하지 않는다', () => {
    const now = 1_000_000;
    expect(
      decideBack(ctx({ isHome: true, lastExitPromptAt: now - EXIT_CONFIRM_WINDOW_MS, now })),
    ).toBe('confirmExit');
  });
});

describe('isHomePath', () => {
  // expo-router 는 같은 홈 화면을 여러 형태로 표현한다. 한 형태만 비교하면
  // 홈에서도 '홈으로 이동'만 반복하며 영영 앱을 나갈 수 없게 된다.
  it.each(['/', '/(tabs)', '/(tabs)/', '/(tabs)/index', '/index'])(
    '%p 는 홈이다',
    (path) => {
      expect(isHomePath(path)).toBe(true);
    },
  );

  it.each(['/(tabs)/review', '/collection/today', '/settings', '/(tabs)/cards'])(
    '%p 는 홈이 아니다',
    (path) => {
      expect(isHomePath(path)).toBe(false);
    },
  );

  // 경로를 모를 때는 홈이 아닌 것으로 본다. 그래야 '홈으로 이동'이 선택되어
  // 최악의 경우에도 앱이 꺼지지 않는다 — 모를 때는 안 끄는 쪽으로 기운다.
  it.each([null, undefined, ''])('경로를 알 수 없으면(%p) 홈으로 보지 않는다', (path) => {
    expect(isHomePath(path)).toBe(false);
  });
});

describe('endFlow', () => {
  function fakeRouter() {
    const calls: string[] = [];
    return {
      calls,
      replace: (p: string) => calls.push(`replace:${p}`),
      push: (p: string) => calls.push(`push:${p}`),
      canGoBack: () => false,
    };
  }

  it('홈을 깔고 목적지를 얹는다 — 뒤로가기가 홈으로 가도록', () => {
    const r = fakeRouter();
    endFlow(r as never, ROUTES.collection('today'));
    expect(r.calls).toEqual([`replace:${ROUTES.home}`, `push:${ROUTES.collection('today')}`]);
  });

  it('목적지가 홈이면 홈 위에 홈을 얹지 않는다', () => {
    const r = fakeRouter();
    endFlow(r as never, ROUTES.home);
    expect(r.calls).toEqual([`replace:${ROUTES.home}`]);
  });

  it('끝낸 세션 화면은 스택에 남기지 않는다', () => {
    const r = fakeRouter();
    endFlow(r as never, ROUTES.review);
    // push 만 했다면 뒤로가기로 방금 끝낸 세션에 다시 들어가게 된다.
    expect(r.calls[0]).toBe(`replace:${ROUTES.home}`);
  });
});
