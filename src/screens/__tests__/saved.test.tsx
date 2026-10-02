// 저장한 카드 목록 — 조작 요소 구조 회귀 테스트.
//
// 과거 버그: 항목 전체가 '내용 열기' Pressable 이고 그 **안에** '저장 해제' Pressable 이
// 들어 있었다. 알림 목록에서 고쳤던 것과 똑같은 결함이다 — 웹(react-native-web)에서는
// 둘 다 <button> 으로 렌더되어 버튼 안에 버튼이 생기고, 스크린 리더는 안쪽 '저장 해제'를
// 바깥 버튼의 이름 속에 묻어 버린다.
//
// 지금은 본문과 해제 버튼이 형제라 그 구조가 생기지 않는다.

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('../../hooks/useCards', () => ({
  useAllCards: () => ({ data: [mockCard], isLoading: false, error: null, refetch: jest.fn() }),
}));

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SavedScreen from '../../../app/saved';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { useBookmarkStore } from '../../store/bookmarkStore';
import { nestedButtonLabels, type TreeNode } from '../../test-utils/nestedButtons';
import type { LearningCard } from '../../domain/models/LearningCard';

const mockCard: LearningCard = {
  id: 'c-1',
  category: '전기 위험',
  subCategory: '배선설비',
  topic: '전기화재 기본',
  keywords: ['과전류'],
  title: '과전류 차단',
  difficulty: 'easy',
  studySeconds: 30,
  situation: '분전반에서 탄 냄새가 난다.',
  question: '가장 먼저 할 일은?',
  principle: '과전류는 도체를 발열시킨다.',
  conclusion: '먼저 전원을 끊는다.',
  hasImage: false,
  status: 'new',
  dueAt: null,
};

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const wrap = () =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>
        <SavedScreen />
      </ThemeProvider>
    </SafeAreaProvider>,
  );

describe('저장한 카드 — 조작 요소 구조', () => {
  beforeEach(() => {
    mockPush.mockClear();
    useBookmarkStore.setState({ ids: [mockCard.id] } as never);
  });

  it('저장한 항목이 실제로 그려진다(빈 목록으로 통과하는 헛검사 방지)', () => {
    wrap();
    expect(screen.getByLabelText('저장 해제')).toBeTruthy();
  });

  it('버튼 안에 버튼이 없다', () => {
    wrap();
    expect(nestedButtonLabels(screen.UNSAFE_root as unknown as TreeNode)).toEqual([]);
  });
});
