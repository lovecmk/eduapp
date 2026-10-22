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
import { advanceSessionEpoch } from '../../data/network/sessionEpoch';

beforeEach(() => {
  useSrsStore.getState().reset();
  useAttendanceStore.setState({ stamps: {} });
  mockPull.mockReset(); mockGrade.mockReset(); mockAttendance.mockReset();
  mockGrade.mockResolvedValue(undefined); mockAttendance.mockResolvedValue(undefined);
});
it('discards a delayed snapshot as soon as the session epoch changes', async () => {
  let resolve!: (value: unknown) => void;
  mockPull.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const hook = renderHook(() => useProgressSync());
  advanceSessionEpoch();
  await act(async () => { resolve({ cards: { old: initialState() }, history: {}, attendance: { old: 1000 } }); });
  expect(useSrsStore.getState().cards).toEqual({});
  expect(useAttendanceStore.getState().stamps).toEqual({});
  hook.unmount();
});
it('does not send an attendance change through an expired subscription', async () => {
  mockPull.mockResolvedValue({ cards: {}, history: {}, attendance: {} });
  const hook = renderHook(() => useProgressSync());
  await act(async () => {});
  advanceSessionEpoch();
  act(() => { useAttendanceStore.setState({ stamps: { '2026-9-22': 1000 } }); });
  expect(mockAttendance).not.toHaveBeenCalled();
  hook.unmount();
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
