import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { LearningCalendar } from '../LearningCalendar';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import { useSrsStore } from '../../../store/srsStore';
import { useAttendanceStore } from '../../../store/attendanceStore';
import { initialState } from '../../../domain/srs';
import type { LearningCard } from '../../../domain/models/LearningCard';

const mockCards = jest.fn();
const mockRefetch = jest.fn();
const mockPush = jest.fn();
const mockCalendar = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../../../hooks/useCards', () => ({ useAllCards: () => mockCards() }));
jest.mock('../../../hooks/useLearningCalendar', () => ({ useLearningCalendar: () => mockCalendar() }));
jest.mock('../../../hooks/useLearningDay', () => ({ useLearningDay: () => require('../../../utils/workday').learningDay() }));
jest.mock('../../ui/AnimatedSheet', () => ({ AnimatedSheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => visible ? children : null }));

const NOW = Date.parse('2026-10-24T03:00:00Z');
const card = (id: string) => ({ id, status: 'learning', question: `${id} 문제`, category: '전기 위험', subCategory: '배선' } as LearningCard);
const due = (at: string) => ({ ...initialState(NOW), reps: 1, lastGrade: 'again' as const, dueAt: Date.parse(at) });
const show = () => render(<ThemeProvider><LearningCalendar /></ThemeProvider>);
const select = (day: number) => fireEvent.press(screen.getByLabelText(new RegExp(`^10월 ${day}일 `)));

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  useSrsStore.setState({ cards: {
    sat: due('2026-10-24T00:00:00+09:00'), sun: due('2026-10-25T00:00:00+09:00'), past: due('2026-10-23T00:00:00+09:00'),
  }, history: { '2026-9-23': ['past', 'past', 'unavailable'], '2026-9-24': ['sat'] } });
  useAttendanceStore.setState({ stamps: {} });
  mockCards.mockReturnValue({ data: [card('sat'), card('sun'), card('past')], isLoading: false, error: null, refetch: mockRefetch });
  mockCalendar.mockReturnValue({});
});
afterEach(() => { jest.useRealTimers(); useSrsStore.getState().reset(); });

it('shows Saturday review records and pending reviews while clearly retaining the new-learning rest rule', () => {
  show();
  expect(screen.getByLabelText(/^10월 24일 .*학습·복습 기록 1장, 복습 일정 2장/)).toBeTruthy();
  select(24);
  expect(screen.getByText('2026년 10월 24일')).toBeTruthy();
  expect(screen.getByText('주말 · 신규 학습 쉬는 날 · 복습 가능')).toBeTruthy();
  expect(screen.getByText('학습·복습한 카드 1')).toBeTruthy();
  expect(screen.getByText('오늘 복습 일정 2')).toBeTruthy();
});

it('past details show only actual records, including unavailable-card counts', () => {
  show(); select(23);
  expect(screen.getByText('학습·복습한 카드 2')).toBeTruthy();
  expect(screen.getByText('현재 볼 수 없는 카드 1장의 기록이 포함되어 있어요')).toBeTruthy();
  expect(screen.queryByText(/^(복습 예정|오늘 복습 일정)/)).toBeNull();
});

it('future Sunday shows its genuine review plan without an empty past-history message', () => {
  show(); select(25);
  expect(screen.getByText('주말 · 신규 학습 쉬는 날 · 복습 가능')).toBeTruthy();
  expect(screen.getByText('복습 예정 1')).toBeTruthy();
  expect(screen.getByText('sun 문제')).toBeTruthy();
  expect(screen.queryByText(/학습·복습한 카드/)).toBeNull();
  expect(screen.queryByText(/기록이 없어요/)).toBeNull();
});

it('future dates with no schedule say so explicitly', () => {
  show(); select(26);
  expect(screen.getByText('복습 예정 0')).toBeTruthy();
  expect(screen.getByText('예정된 복습 카드가 없어요')).toBeTruthy();
});

it('uses server holidays in both date accessibility and detail', () => {
  mockCalendar.mockReturnValue({ '2026-9-22': { date: '2026-10-22', can_learn_new: false, can_review: true, holiday_name: '임시공휴일', reason: 'HOLIDAY' } });
  show();
  expect(screen.getByLabelText(/^10월 22일 임시공휴일 신규 학습 쉬는 날/)).toBeTruthy();
  select(22);
  expect(screen.getByText('임시공휴일 · 신규 학습 쉬는 날 · 복습 가능')).toBeTruthy();
});

it('supports returning to the current month after navigation', () => {
  show();
  fireEvent.press(screen.getByLabelText('다음 달'));
  expect(screen.getByText('2026년 11월')).toBeTruthy();
  fireEvent.press(screen.getByText('이번 달로 돌아가기'));
  expect(screen.getByText('2026년 10월')).toBeTruthy();
  expect(screen.queryByText('이번 달로 돌아가기')).toBeNull();
});

it('shows retry instead of falsely claiming an empty schedule on card API failure', () => {
  mockCards.mockReturnValue({ data: undefined, isLoading: false, error: new Error('offline'), refetch: mockRefetch });
  show(); select(25);
  expect(screen.queryByText('예정된 복습 카드가 없어요')).toBeNull();
  fireEvent.press(screen.getByText('카드 목록 다시 불러오기'));
  expect(mockRefetch).toHaveBeenCalledTimes(1);
});
