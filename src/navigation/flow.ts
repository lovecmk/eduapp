import type { Router } from 'expo-router';
import type { NavigationProp, NavigationState, ParamListBase } from '@react-navigation/native';

import { ROUTES } from '../constants/routes';

/** End a session without reopening its completion screen on back.
 * Review stays in the existing tabs navigator, with home as its back target.
 * Stack destinations retain the home base used by the global back policy.
 */
export function endFlow(router: Router, target: string, tabs?: Pick<NavigationProp<ParamListBase>, 'reset'> & { getState(): NavigationState | undefined }): void {
  // Tabs are siblings in one navigator: a single action keeps that navigator
  // and its tab bar. Replacing home then pushing a tab races two actions.
  if (target === ROUTES.review || target.startsWith(ROUTES.review + '?')) {
    const state = tabs?.getState();
    const index = state?.routes.findIndex(route => route.name === 'review') ?? -1;
    const home = state?.routes.find(route => route.name === 'index');
    if (state?.type === 'tab' && index >= 0 && home) {
      // Replace the tab history too: Android back must not reopen a completed
      // learning session. Keep all route keys so other tabs retain their state.
      tabs!.reset({ ...state, index, history: [
        { type: 'route', key: home.key }, { type: 'route', key: state.routes[index].key },
      ] } as typeof state);
      return;
    }
    router.replace(target as never);
    return;
  }
  // 홈이 목적지면 갈아 끼우는 것만으로 충분하다(홈 위에 홈을 얹지 않는다).
  if (target === ROUTES.home) {
    router.replace(ROUTES.home as never);
    return;
  }
  router.replace(ROUTES.home as never);
  router.push(target as never);
}

/*
 * '돌아갈 곳이 없을 때 앱이 꺼지는' 문제는 여기서 다루지 않는다.
 *
 * 한때 openWithHomeBase(스택이 비어 있으면 홈을 깔고 push) 를 여기 뒀는데,
 * 정작 아무 데서도 쓰지 않았다. 이유가 있었다 — 같은 규칙을 이미
 * useAppBackHandler + decideBack 이 앱 전체에 걸어 두고 있다.
 * 돌아갈 곳이 없고 홈도 아니면 종료 대신 홈으로 보낸다.
 *
 * 규칙이 두 곳에 있으면 반드시 한쪽만 바뀐다. 게다가 호출부마다 챙겨야 하는
 * 방식은 화면이 새로 생길 때 또 빠진다. 마지막 방어선은 한 곳에 둔다.
 */
