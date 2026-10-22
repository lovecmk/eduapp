import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import { DailyLearningWelcome } from '../DailyLearningWelcome';

const mockClaim = jest.fn();
const mockCompletion = jest.fn();
const mockAssignment = jest.fn();
const mockDay = jest.fn();
jest.mock('../../../data/dailyWelcome', () => ({ claimDailyWelcome: (...args: unknown[]) => mockClaim(...args) }));
jest.mock('../../../hooks/useLearningCompletion', () => ({ useLearningCompletion: () => mockCompletion() }));
jest.mock('../../../hooks/useDailyAssignment', () => ({ useDailyAssignment: () => mockAssignment() }));
jest.mock('../../../hooks/useLearningDay', () => ({ useLearningDay: () => mockDay() }));
jest.mock('expo-router', () => ({ usePathname: () => '/' }));
jest.mock('../../ui/CenterModal', () => ({ CenterModal: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => visible ? children : null }));
const quote = { day: '2026-10-22', streak: 5, quoteIndex: 0, category: '성장', text: '오늘의 작은 배움이 내일의 큰 실력이 됩니다.' };
let foreground: (state: string) => void;
beforeEach(() => {
  mockClaim.mockResolvedValueOnce(quote).mockResolvedValue(null);
  mockCompletion.mockReturnValue({ streak: 5 });
  mockAssignment.mockReturnValue({ isSuccess: true, isError: false });
  mockDay.mockReturnValue({ date: '2026-10-22' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => { foreground = callback as (state: string) => void; return { remove: jest.fn() }; });
});
afterEach(() => jest.restoreAllMocks());
it('shows the shared learning streak and the selected quote, then closes without reopening on rerender', async () => {
  const view = render(<ThemeProvider><DailyLearningWelcome userId="a" /></ThemeProvider>);
  await waitFor(() => expect(screen.getByText(quote.text)).toBeTruthy());
  expect(screen.getByText('5일')).toBeTruthy();
  expect(screen.getByText('성장')).toBeTruthy();
  fireEvent.press(screen.getByText('좋은 하루 시작하기'));
  mockCompletion.mockReturnValue({ streak: 6 });
  view.rerender(<ThemeProvider><DailyLearningWelcome userId="a" /></ThemeProvider>);
  expect(screen.queryByTestId('daily-learning-welcome')).toBeNull();
  expect(mockClaim).toHaveBeenCalledTimes(1);
});
it('waits for daily-assignment loading to settle', async () => {
  mockAssignment.mockReturnValue({ isSuccess: false, isError: false });
  const view = render(<ThemeProvider><DailyLearningWelcome userId="a" /></ThemeProvider>);
  expect(mockClaim).not.toHaveBeenCalled();
  mockAssignment.mockReturnValue({ isSuccess: true, isError: false });
  view.rerender(<ThemeProvider><DailyLearningWelcome userId="a" /></ThemeProvider>);
  await waitFor(() => expect(screen.getByTestId('daily-learning-welcome')).toBeTruthy());
});
it('keeps the visible streak synchronized when calendar data arrives later', async () => {
  const view = render(<ThemeProvider><DailyLearningWelcome userId="a" /></ThemeProvider>);
  await waitFor(() => expect(screen.getByText('5일')).toBeTruthy());
  mockCompletion.mockReturnValue({ streak: 6 });
  view.rerender(<ThemeProvider><DailyLearningWelcome userId="a" /></ThemeProvider>);
  expect(screen.getByText('6일')).toBeTruthy();
  expect(mockClaim).toHaveBeenCalledTimes(1);
});
it('hides the overlay in background and restores it without claiming another welcome', async () => {
  render(<ThemeProvider><DailyLearningWelcome userId="a" /></ThemeProvider>);
  await waitFor(() => expect(screen.getByTestId('daily-learning-welcome')).toBeTruthy());
  act(() => foreground('background'));
  expect(screen.queryByTestId('daily-learning-welcome')).toBeNull();
  expect(mockClaim).toHaveBeenCalledTimes(1);
  act(() => foreground('active'));
  await waitFor(() => expect(mockClaim).toHaveBeenCalledTimes(2));
  expect(screen.getByText(quote.text)).toBeTruthy();
});
it('does not interrupt an already active session at midnight, and checks again on foreground return', async () => {
  const view = render(<ThemeProvider><DailyLearningWelcome userId="a" /></ThemeProvider>);
  await waitFor(() => expect(screen.getByTestId('daily-learning-welcome')).toBeTruthy());
  fireEvent.press(screen.getByText('좋은 하루 시작하기'));
  mockDay.mockReturnValue({ date: '2026-10-23' });
  view.rerender(<ThemeProvider><DailyLearningWelcome userId="a" /></ThemeProvider>);
  expect(mockClaim).toHaveBeenCalledTimes(1);
  mockClaim.mockResolvedValueOnce({ ...quote, day: '2026-10-23', text: '새로운 하루의 명언' });
  act(() => foreground('active'));
  await waitFor(() => expect(screen.getByText('새로운 하루의 명언')).toBeTruthy());
  expect(mockClaim).toHaveBeenLastCalledWith('a', '2026-10-23', 5, expect.any(Function));
});
