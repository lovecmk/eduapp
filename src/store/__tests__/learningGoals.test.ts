jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: async () => null, setItem: async () => {}, removeItem: async () => {} }));
import { useSrsStore } from '../srsStore';
beforeEach(() => useSrsStore.getState().reset());
it('records the actual issued goal and server-confirmed done cards without inventing grades', () => {
  useSrsStore.getState().recordGoal('2026-9-22', { targetCount: 2, cardIds: ['a', 'b'] }, ['a', 'a', 'unassigned']);
  expect(useSrsStore.getState().history['2026-9-22']).toEqual(['a']);
  expect(useSrsStore.getState().cards).toEqual({});
  expect(useSrsStore.getState().dailyGoals['2026-9-22'].targetCount).toBe(2);
});
it('an old-server snapshot keeps observed goals; a new server restores historical goals', () => {
  const store = useSrsStore.getState();
  store.recordGoal('2026-9-22', { targetCount: 2, cardIds: ['a', 'b'] });
  store.applyServer({ cards: {}, history: {} });
  expect(useSrsStore.getState().dailyGoals['2026-9-22'].targetCount).toBe(2);
  store.applyServer({ cards: {}, history: {}, dailyGoals: { '2026-9-21': { targetCount: 1, cardIds: ['c'] } } });
  expect(Object.keys(useSrsStore.getState().dailyGoals)).toHaveLength(2);
});
it('merges server holidays per month without losing other months and clears them on user reset', () => {
  const store = useSrsStore.getState();
  store.applyCalendar(2026, 9, { '2026-9-22': '임시공휴일' });
  store.applyCalendar(2026, 10, { '2026-10-2': '휴무일' });
  store.applyCalendar(2026, 9, {});
  expect(useSrsStore.getState().restDays).toEqual({ '2026-10-2': '휴무일' });
  store.reset();
  expect(useSrsStore.getState().restDays).toEqual({});
  expect(useSrsStore.getState().dailyGoals).toEqual({});
});
