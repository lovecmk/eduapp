import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ContentsScreen from '../../../app/contents';
import { ThemeProvider } from '../../theme/ThemeProvider';
import type { LearningCard } from '../../domain/models/LearningCard';

const mockPush = jest.fn();
let mockCards: LearningCard[] = [];
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock('../../hooks/useCards', () => ({
  useAllCards: () => ({ data: mockCards, isLoading: false, error: null, refetch: jest.fn() }),
}));
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, bottom: 0, left: 0, right: 0 } };
function card(id: string, code: string, category: string): LearningCard {
  return { id, title: `${id} 제목`, question: `${id} 질문`, category: '현장 점검',
    taxonomyCategoryCode: code, taxonomyCategory: category, groupCode: 'MEASURE',
    subCategory: '기타분류', topic: '', keywords: [], situation: '', principle: '해설',
    conclusion: '정답', difficulty: 'medium', studySeconds: 20, hasImage: false, status: 'new', dueAt: null };
}
function show() {
  return render(<SafeAreaProvider initialMetrics={metrics}><ThemeProvider><ContentsScreen /></ThemeProvider></SafeAreaProvider>);
}
beforeEach(() => {
  mockPush.mockClear();
  mockCards = [card('water1', 'WATEREXT', '수계소화설비'), card('water2', 'WATEREXT', '수계소화설비'), card('alarm', 'ALARM', '경보설비')];
});

it('배포 카드의 정본 분류와 건수로 과정이 나오고 난이도별 카드로 진입한다', () => {
  const view = show();
  expect(view.getAllByRole('button', { name: /과정, \d+문제/ })).toHaveLength(2);
  fireEvent.press(view.getByRole('button', { name: '수계소화설비 과정, 2문제' }));
  expect(view.getByText('2문제')).toBeTruthy();
  expect(view.queryByText('alarm 질문')).toBeNull();
  fireEvent.press(view.getByText('water1 질문'));
  expect(mockPush).toHaveBeenCalledWith('/content/water1');
  fireEvent.press(view.getByText('모든 과정'));
  expect(view.getByRole('button', { name: '경보설비 과정, 1문제' })).toBeTruthy();
});

it('집계 분류가 현장 점검이어도 정본 분류명으로 검색할 수 있다', () => {
  const view = show();
  fireEvent.changeText(view.getByPlaceholderText('주제·질문 검색...'), '경보설비');
  expect(view.getByText('검색 결과 1건')).toBeTruthy();
  expect(view.getByText('alarm 질문')).toBeTruthy();
  expect(view.queryByText('water1 질문')).toBeNull();
});

it('배포 카드가 없으면 자격증·기술사 예고 과정이나 빈 과정을 만들지 않는다', () => {
  mockCards = [];
  const view = show();
  expect(view.queryAllByRole('button', { name: /과정, \d+문제/ })).toHaveLength(0);
  expect(view.queryByText('산업안전기사')).toBeNull();
  expect(view.queryByText('소방기술사 대비')).toBeNull();
});
