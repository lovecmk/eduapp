import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDailyAssignment } from '../useDailyAssignment';
import { useDailyQuota } from '../useDailyQuota';
import { useLearningDay } from '../useLearningDay';
import type { DailyAssignment } from '../../domain/models/DailyAssignment';
import { useSrsStore } from '../../store/srsStore';

const mockAssignment = jest.fn();
const mockQuota = jest.fn();
const mockCalendar = jest.fn();
jest.mock('../../data/network/ApiClient', () => ({ apiClient: { get: () => mockCalendar() } }));
jest.mock('../../data/repositories', () => ({
  dailyAssignmentRepository: { get: () => mockAssignment() },
  learningQuotaRepository: { getQuota: () => mockQuota() },
}));
jest.mock('../../store/dailyLearningStore', () => ({ useDailyLearningStore: (select: (value: unknown) => unknown) => select({ dayKey: '', newLearnedToday: 0 }) }));

const assignment: DailyAssignment = {
  day: '2026-9-24', difficulty: 'easy', targetCount: 3, doneCount: 1,
  cards: [
    { card: { id: 'new' }, kind: 'new', done: false },
    { card: { id: 'review' }, kind: 'review', done: false },
    { card: { id: 'done-review' }, kind: 'review', done: true },
  ] as DailyAssignment['cards'],
};
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-24T03:00:00Z')); useSrsStore.getState().reset(); mockAssignment.mockResolvedValue(assignment); mockQuota.mockResolvedValue({ limit: 3, used: 0 }); mockCalendar.mockResolvedValue(null); });
afterEach(() => jest.useRealTimers());

it('filters cached/older-server NEW cards on Saturday and keeps completed reviews in the denominator', async () => {
  const hook = renderHook(() => useDailyAssignment(), { wrapper: wrapper() });
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
  expect(hook.result.current.assignment).toMatchObject({ targetCount: 2, doneCount: 1, cards: [{ kind: 'review' }, { kind: 'review' }] });
  hook.unmount();
});
it('closes new learning offline and with an older server quota while leaving reviews available', async () => {
  const hook = renderHook(() => useDailyQuota(), { wrapper: wrapper() });
  await waitFor(() => expect(mockQuota).toHaveBeenCalled());
  expect(hook.result.current).toMatchObject({ isRestDay: true, limit: 0, remaining: 0, canLearn: false });
  hook.unmount();
});
it('refreshes a live Friday session after Korean midnight', () => {
  jest.setSystemTime(new Date('2026-10-23T14:59:59Z'));
  const hook = renderHook(() => useLearningDay());
  expect(hook.result.current.can_learn_new).toBe(true);
  act(() => jest.advanceTimersByTime(1000));
  expect(hook.result.current).toMatchObject({ date: '2026-10-24', can_learn_new: false, can_review: true });
  hook.unmount();
});

it('uses an extra server holiday in both quota and today deck even with older endpoint responses', async () => {
  jest.setSystemTime(new Date('2026-10-22T03:00:00Z'));
  mockCalendar.mockResolvedValue({ timezone: 'Asia/Seoul', year: 2026, month: 10,
    days: [{ date: '2026-10-22', can_learn_new: false, can_review: true, holiday_name: '임시공휴일' }] });
  const hook = renderHook(() => ({ quota: useDailyQuota(), today: useDailyAssignment() }), { wrapper: wrapper() });
  await waitFor(() => expect(hook.result.current.quota.isRestDay).toBe(true));
  expect(hook.result.current.quota).toMatchObject({ limit: 0, canLearn: false, restDayName: '임시공휴일' });
  expect(hook.result.current.today.assignment.cards.every(card => card.kind === 'review')).toBe(true);
  hook.unmount();
});

it('keeps a locally completed review done while a stale live server response catches up', async () => {
  const hook = renderHook(() => useDailyAssignment(), { wrapper: wrapper() });
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
  act(() => { useSrsStore.setState({ history: { '2026-9-24': ['review'] } }); });
  expect(hook.result.current.assignment).toMatchObject({ targetCount: 2, doneCount: 2, cards: [{ done: true }, { done: true }] });
  hook.unmount();
});
