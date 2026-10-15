jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: () => Promise.resolve(null), setItem: () => Promise.resolve(), removeItem: () => Promise.resolve(),
}));
import { firstDecision, useSrsStore } from '../srsStore';
import { initialState } from '../../domain/srs';

beforeEach(() => useSrsStore.getState().reset());

it('최초 선택과 시각을 복습 후에도 보존하고 최신 일정/판정은 갱신한다', () => {
  useSrsStore.getState().grade('c', 'again');
  const first = firstDecision(useSrsStore.getState().cards.c);
  useSrsStore.getState().grade('c', 'good');
  const reviewed = useSrsStore.getState().cards.c;
  expect(firstDecision(reviewed)).toEqual(first);
  expect(first?.grade).toBe('again');
  expect(reviewed.lastGrade).toBe('good');
  expect(reviewed.reps).toBe(2);
  expect(reviewed.box).toBe(4);
  expect(reviewed.dueAt).toBeGreaterThan(reviewed.lastReviewedAt!);
});

it('더 최신인 서버 상태를 병합해도 최초 선택을 덮어쓰지 않는다', () => {
  useSrsStore.getState().grade('c', 'good');
  const first = firstDecision(useSrsStore.getState().cards.c);
  useSrsStore.getState().applyServer({ cards: { c: { ...initialState(), lastGrade: 'again', lastReviewedAt: Date.now() + 1000, reps: 2, lapses: 1 } }, history: {} });
  expect(firstDecision(useSrsStore.getState().cards.c)).toEqual(first);
  expect(useSrsStore.getState().cards.c.lastGrade).toBe('again');
});

it('과거 1회 기록은 복원하되 여러 번 학습한 마지막 선택을 최초라고 표시하지 않는다', () => {
  const old = { ...initialState(), reps: 1, lastGrade: 'again' as const, lastReviewedAt: 1234 };
  expect(firstDecision(old)).toEqual({ grade: 'again', at: 1234 });
  expect(firstDecision({ ...old, reps: 2 })).toBeUndefined();
  useSrsStore.setState({ cards: { c: old } });
  useSrsStore.getState().grade('c', 'good');
  expect(firstDecision(useSrsStore.getState().cards.c)).toEqual({ grade: 'again', at: 1234 });
});

it('재시작에 쓰는 영구 저장 상태에 최초 기록을 포함하고 계정 초기화 시 함께 지운다', () => {
  useSrsStore.getState().grade('c', 'again');
  const restored = JSON.parse(JSON.stringify(useSrsStore.getState().cards));
  useSrsStore.getState().reset();
  expect(firstDecision(useSrsStore.getState().cards.c)).toBeUndefined();
  useSrsStore.setState({ cards: restored });
  expect(firstDecision(useSrsStore.getState().cards.c)?.grade).toBe('again');
});
