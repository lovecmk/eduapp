import { renderHook, act, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
const mockPull = jest.fn();
const mockGrade = jest.fn();
const mockAttendance = jest.fn();
const mockFlush = jest.fn();
let mockOnState: ((status: string) => void) | undefined;
jest.mock('../../data/network/ApiClient', () => ({ apiClient: { flushPendingWrites: () => mockFlush() } }));
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
  mockFlush.mockReset(); mockFlush.mockResolvedValue(0);
  mockOnState = undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_event: string, callback: (status: string) => void) => {
    mockOnState = callback;
    return { remove: jest.fn() };
  }) as never);
});
afterEach(() => jest.restoreAllMocks());
it('pulls progress learned on another device when the app returns to the foreground', async () => {
  mockPull.mockResolvedValueOnce({ cards: {}, history: {}, attendance: {} });
  const hook = renderHook(() => useProgressSync());
  await act(async () => {});
  mockPull.mockResolvedValue({ cards: { elsewhere: { ...initialState(), reps: 1, lastReviewedAt: 1000 } }, history: { today: ['elsewhere'] }, attendance: { today: 1000 } });
  await act(async () => { mockOnState?.('active'); });
  expect(mockPull).toHaveBeenCalledTimes(2);
  expect(useSrsStore.getState().cards.elsewhere?.reps).toBe(1);
  expect(useAttendanceStore.getState().stamps.today).toBe(1000);
  expect(mockGrade).not.toHaveBeenCalled();
  expect(mockAttendance).not.toHaveBeenCalled();
  hook.unmount();
});
it('waits for queued writes and shares repeated foreground notifications', async () => {
  mockPull.mockResolvedValue({ cards: {}, history: {}, attendance: {} });
  const hook = renderHook(() => useProgressSync());
  await act(async () => {});
  mockFlush.mockClear();
  let release!: () => void;
  mockFlush.mockReturnValueOnce(new Promise<void>(done => { release = done; }));
  act(() => { mockOnState?.('active'); mockOnState?.('active'); });
  expect(mockFlush).toHaveBeenCalledTimes(1);
  expect(mockPull).toHaveBeenCalledTimes(1);
  await act(async () => { release(); });
  expect(mockPull).toHaveBeenCalledTimes(2);
  hook.unmount();
});
it('flushes restored offline writes before the first snapshot after login', async () => {
  let release!: () => void;
  mockFlush.mockReturnValueOnce(new Promise<void>(done => { release = done; }));
  mockPull.mockResolvedValue({ cards: {}, history: {}, attendance: {} });
  const hook = renderHook(() => useProgressSync());
  expect(mockPull).not.toHaveBeenCalled();
  await act(async () => { release(); });
  expect(mockPull).toHaveBeenCalledTimes(1);
  hook.unmount();
});
it('does not refresh a previous session after a delayed queue flush', async () => {
  mockPull.mockResolvedValue({ cards: {}, history: {}, attendance: {} });
  const hook = renderHook(() => useProgressSync());
  await act(async () => {});
  let release!: () => void;
  mockFlush.mockReturnValueOnce(new Promise<void>(done => { release = done; }));
  act(() => { mockOnState?.('active'); });
  advanceSessionEpoch();
  await act(async () => { release(); });
  expect(mockPull).toHaveBeenCalledTimes(1);
  hook.unmount();
});
it('discards a delayed snapshot as soon as the session epoch changes', async () => {
  let resolve!: (value: unknown) => void;
  mockPull.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const hook = renderHook(() => useProgressSync());
  await act(async () => {});
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
