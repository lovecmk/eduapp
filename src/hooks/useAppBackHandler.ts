import { useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';
import { usePathname, useRouter } from 'expo-router';

import { decideBack, isHomePath } from '../navigation/backPolicy';
import { ROUTES } from '../constants/routes';
import { toast } from '../store/toastStore';

/**
 * 앱 전체의 뒤로가기 안전망 — 루트에 한 번만 건다.
 *
 * 화면별 뒤로가기 처리(학습 중 이탈 확인 등)는 그대로 두고, **아무도 처리하지 않은
 * 뒤로가기**만 여기서 받는다. React Native 의 BackHandler 는 나중에 등록된 핸들러부터
 * 호출하므로, 루트에서 먼저 등록해 두면 화면별 핸들러가 항상 우선한다.
 *
 * 이 안전망이 없던 동안 학습을 마치고 복습으로 이동한 뒤 뒤로가기를 누르면 앱이
 * 그대로 종료됐다. 개별 화면을 고쳐도 같은 형태의 이동이 앱 곳곳에 있어 재발한다 —
 * 마지막 방어선은 한 곳에 있어야 한다.
 */
export function useAppBackHandler(): void {
  const router = useRouter();
  const pathname = usePathname();

  // 최신 값을 핸들러가 보게 하되, 값이 바뀔 때마다 리스너를 다시 붙이지는 않는다.
  // 리스너를 재등록하면 등록 순서가 바뀌어 화면별 핸들러보다 뒤로 밀릴 수 있다.
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  const lastPromptRef = useRef<number | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const onBack = (): boolean => {
      const decision = decideBack({
        canGoBack: router.canGoBack(),
        isHome: isHomePath(pathRef.current),
        lastExitPromptAt: lastPromptRef.current,
        now: Date.now(),
      });

      switch (decision) {
        case 'pop':
          router.back();
          return true;
        case 'goHome':
          // 돌아갈 곳이 없어도 앱을 끄지 않는다 — 홈으로 데려다 놓는다.
          router.replace(ROUTES.home as never);
          return true;
        case 'confirmExit':
          lastPromptRef.current = Date.now();
          toast('한 번 더 누르면 앱이 종료돼요', 'info', 2000);
          return true;
        case 'exit':
          lastPromptRef.current = null;
          return false; // 기본 동작(종료)에 맡긴다
      }
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [router]);
}
