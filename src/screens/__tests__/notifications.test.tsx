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
import NotificationsScreen from '../../../app/notifications';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { useNotificationStore } from '../../store/notificationStore';
import { nestedButtonLabels, type TreeNode } from '../../test-utils/nestedButtons';
import type { AppNotification } from '../../domain/models/Notification';

const FIXTURE: AppNotification[] = [
  { id: 'a1', type: 'achievement', title: '누적 50개 카드 완료 🏅', desc: '50개를 학습했어요.', minutesAgo: 30, read: false, category: '성취' },
  { id: 's1', type: 'system', title: '점검 안내', desc: '오늘 밤 점검이 있어요.', minutesAgo: 90, read: true, category: '공지' },
];

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

describe('알림 화면 — 조작 요소 구조', () => {
  beforeEach(() => {
    mockPush.mockClear();
    useNotificationStore.setState({ items: FIXTURE.map((n) => ({ ...n })), dismissedIds: [] });
  });

  it('알림이 실제로 그려진다(빈 목록으로 통과하는 헛검사 방지)', () => {
    wrap();
    expect(screen.getAllByLabelText('이 알림 메뉴').length).toBeGreaterThan(0);
  });

  it('버튼 안에 버튼이 없다', () => {
    wrap();
    expect(nestedButtonLabels(screen.UNSAFE_root as unknown as TreeNode)).toEqual([]);
  });
});

// 지운 알림 — 서버 계약에 삭제가 없어 예전에는 1분 뒤 동기화(applyServer)가
// 서버 목록으로 갈아 끼우면서 지운 알림이 전부 되살아났다.
describe('알림 삭제가 동기화 뒤에도 유지된다', () => {
  beforeEach(() => {
    useNotificationStore.setState({ items: FIXTURE.map((n) => ({ ...n })), dismissedIds: [] });
  });

  it('하나 지운 뒤 서버 목록을 받아도 그 알림은 돌아오지 않는다', () => {
    useNotificationStore.getState().remove('a1');
    useNotificationStore.getState().applyServer(FIXTURE.map((n) => ({ ...n })));
    expect(useNotificationStore.getState().items.map((n) => n.id)).toEqual(['s1']);
  });

  it('전체 삭제 뒤에도 돌아오지 않고, 새로 온 알림만 보인다', () => {
    useNotificationStore.getState().clearAll();
    const fresh: AppNotification = { ...FIXTURE[1], id: 's2', title: '새 공지' };
    useNotificationStore.getState().applyServer([...FIXTURE.map((n) => ({ ...n })), fresh]);
    expect(useNotificationStore.getState().items.map((n) => n.id)).toEqual(['s2']);
  });

  it('사용자 전환(reset)은 지운 기록까지 비운다 — 다음 사람의 알림을 가리지 않는다', () => {
    useNotificationStore.getState().clearAll();
    useNotificationStore.getState().reset();
    useNotificationStore.getState().applyServer(FIXTURE.map((n) => ({ ...n })));
    expect(useNotificationStore.getState().items).toHaveLength(2);
  });
});
