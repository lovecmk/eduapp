// 알림 목록 — 중첩 버튼 회귀 테스트.
//
// 과거 버그: 항목 전체가 '알림 열기' Pressable 이고 그 **안에** '⋮' 메뉴 Pressable 이
// 들어 있었다. 둘 다 accessibilityRole="button" 이라 웹(react-native-web)에서는
// <button> 안에 <button> 이 렌더된다 — 유효하지 않은 DOM 이고(React 가 매 렌더마다
// validateDOMNesting 오류를 찍는다), 스크린 리더는 중첩된 컨트롤을 제대로 읽어 주지
// 못한다. 지금은 본문과 메뉴가 형제라 그 구조가 생기지 않는다.
//
// 화면 전체를 렌더해 '버튼 안의 버튼'을 직접 찾는다 — 구현을 어떻게 바꾸든
// 결과 구조만 고정하므로, 나중에 레이아웃을 손봐도 이 검사는 계속 유효하다.

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import NotificationsScreen from '../notifications';
import { ThemeProvider } from '../../src/theme/ThemeProvider';
import { useNotificationStore } from '../../src/store/notificationStore';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const wrap = () =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>
        <NotificationsScreen />
      </ThemeProvider>
    </SafeAreaProvider>,
  );

// react-test-renderer 에는 타입 선언이 없다(@types 를 새로 들이지 않는다 — SDK 52
// 의존성은 고정이다). 이 검사에 필요한 만큼만 구조적으로 추려 쓴다.
type TreeNode = {
  type: unknown;
  props: Record<string, unknown>;
  parent: TreeNode | null;
  findAll: (predicate: (n: TreeNode) => boolean) => TreeNode[];
};

// 호스트 노드(문자열 타입)만 센다. Pressable 은 트리에 '컴포넌트 + 그것이 그린 View'
// 두 번 나타나고 둘 다 같은 role 을 들고 있어서, 걸러 내지 않으면 버튼 하나가
// 저 자신을 감싼 것처럼 보인다. 실제로 DOM 이 되는 것은 호스트 쪽이다.
const isButton = (node: TreeNode) =>
  typeof node.type === 'string' && node.props?.accessibilityRole === 'button';

/** 자신이 버튼이면서 조상 중에도 버튼이 있는 노드 — 곧 '버튼 안의 버튼'. */
function nestedButtons(root: TreeNode): TreeNode[] {
  return root.findAll(isButton).filter((node) => {
    for (let p = node.parent; p; p = p.parent) if (isButton(p)) return true;
    return false;
  });
}

/** 노드가 품고 있는 모든 텍스트 — 실패 메시지에서 어느 버튼인지 알아보려고. */
const labelOf = (n: TreeNode) =>
  (n.props?.accessibilityLabel as string | undefined) ??
  n.findAll((x) => typeof x.props?.children === 'string')
    .map((x) => x.props.children as string)
    .join(' ')
    .slice(0, 40);

describe('알림 화면 — 조작 요소 구조', () => {
  beforeEach(() => {
    mockPush.mockClear();
    useNotificationStore.getState().refresh();
  });

  it('알림이 실제로 그려진다(빈 목록으로 통과하는 헛검사 방지)', () => {
    wrap();
    expect(screen.getAllByLabelText('이 알림 메뉴').length).toBeGreaterThan(0);
  });

  it('버튼 안에 버튼이 없다', () => {
    wrap();
    const nested = nestedButtons(screen.UNSAFE_root as unknown as TreeNode);
    expect(nested.map(labelOf)).toEqual([]);
  });
});
