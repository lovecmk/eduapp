import { renderHook, act, waitFor } from '@testing-library/react-native';
const mockPull = jest.fn();
const mockGrade = jest.fn();
const mockAttendance = jest.fn();
jest.mock('../../data/repositories', () => ({ progressRepository: {
  pull: () => mockPull(), pushGrade: (...args: unknown[]) => mockGrade(...args), pushAttendance: (...args: unknown[]) => mockAttendance(...args),
} }));
jest.mock('../../store/authStore', () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'a' } }) }));
jest.mock('../../data/network/queryClient', () => ({ queryClient: { setQueryData: jest.fn(), invalidateQueries: jest.fn() } }));
import { useProgressSync } from '../useProgressSync';
import { useSrsStore } from '../../store/srsStore';
import { useAttendanceStore } from '../../store/attendanceStore';
import { initialState } from '../../domain/srs';

beforeEach(() => {
  useSrsStore.getState().reset();
  useAttendanceStore.setState({ stamps: {} });
  mockPull.mockReset(); mockGrade.mockReset(); mockAttendance.mockReset();
  mockGrade.mockResolvedValue(undefined); mockAttendance.mockResolvedValue(undefined);
});
it('does not send restored history back as fresh learning and adopts server intervals', async () => {
  const restored = { ...initialState(), reps: 1, lastReviewedAt: 1000, lastGrade: 'again' as const, dueAt: 99999 };
  mockPull.mockResolvedValue({ cards: { restored }, history: {}, attendance: { '2026-9-12': '2026-10-12T00:00:00Z' } });
  const hook = renderHook(() => useProgressSync());
  await waitFor(() => expect(useSrsStore.getState().cards.restored).toBeDefined());
  expect(mockGrade).not.toHaveBeenCalled();
  expect(mockAttendance).not.toHaveBeenCalled();
  mockPull.mockImplementation(async () => {
    const local = useSrsStore.getState().cards.restored;
    return { cards: { restored: { ...local, dueAt: local.dueAt + 86400000 } }, history: {}, attendance: {} };
  });
  let due = 0;
  act(() => { useSrsStore.getState().grade('restored', 'again'); due = useSrsStore.getState().cards.restored.dueAt; });
  await waitFor(() => expect(useSrsStore.getState().cards.restored.dueAt).toBe(due + 86400000));
  expect(mockGrade).toHaveBeenCalledTimes(1);
  hook.unmount();
});
