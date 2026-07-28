import type { Router } from 'expo-router';

import { ROUTES } from '../constants/routes';

/**
 * '흐름을 끝내고 다른 곳으로 보내는' 이동.
 *
 * 학습을 마친 뒤 복습으로 보내는 것 같은 이동은 두 가지를 동시에 만족해야 한다.
 *
 *   (1) 돌아가기로 방금 끝낸 세션에 **다시 들어가면 안 된다.**
 *       완료 화면으로 되돌아가면 "끝냈는데 왜 또?"가 되고, 진행 상태도 이미 비어 있다.
 *   (2) 그렇다고 **돌아갈 곳이 아예 없어서도 안 된다.**
 *
 * 지금까지는 (1)만 지키려고 `replace` 를 썼다. 그 결과 스택에 아무것도 남지 않아
 * 도착한 화면에서 뒤로가기를 누르면 **앱이 그대로 종료**됐다.
 *
 * 그래서 스택을 홈으로 갈아 끼운 뒤 목적지를 그 위에 얹는다.
 * 끝낸 세션은 사라지고(1), 뒤로가기는 홈으로 간다(2).
 *
 *   [학습 세션]  --endFlow-->  [홈] → [복습 모아보기]
 *                                뒤로가기 ↩ 홈
 */
export function endFlow(router: Router, target: string): void {
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
