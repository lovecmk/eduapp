/**
 * 서버에서 들어온 채점 등급을 정화하는가.
 *
 * 서버는 한동안 `last_grade` 를 **대문자로**('GOOD') 저장했고, 모르는 등급은
 * **빈 문자열**로 저장했다. `SrsCardState.lastGrade` 의 타입은 `Grade | null`
 * 이라 컴파일러는 아무 말도 하지 않지만, `'GOOD' === 'good'` 은 거짓이므로
 * 등급을 비교하는 코드가 전부 조용히 빗나간다. 게다가 이 스토어는 persist 되어
 * 있어 한 번이라도 동기화한 기기에는 그 값이 **디스크에 남는다.**
 *
 * 서버 값이 앱으로 들어오는 문은 `applyServer` 하나뿐이라, 여기서 막으면
 * 일회성 마이그레이션 없이도 옛 값이 다음 동기화에서 정리된다.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: () => Promise.resolve(null),
  setItem: () => Promise.resolve(),
  removeItem: () => Promise.resolve(),
}));

import { useSrsStore } from '../srsStore';
import { normalizeGrade, type SrsCardState } from '../../domain/srs';

const remote = (lastGrade: unknown): SrsCardState =>
  ({ box: 2, ease: 2.5, dueAt: 1_700_000_000_000, reps: 3, lapses: 0, lastReviewedAt: 1_699_000_000_000, lastGrade } as SrsCardState);

describe('normalizeGrade', () => {
  it('아는 네 값만 소문자로 통과시킨다', () => {
    expect(normalizeGrade('GOOD')).toBe('good');
    expect(normalizeGrade('again')).toBe('again');
    expect(normalizeGrade(' Easy ')).toBe('easy');
    expect(normalizeGrade('HARD')).toBe('hard');
  });

  it('모르는 값·빈 값은 null 로 접는다', () => {
    expect(normalizeGrade('')).toBeNull();
    expect(normalizeGrade('perfect')).toBeNull();
    expect(normalizeGrade(null)).toBeNull();
    expect(normalizeGrade(undefined)).toBeNull();
    expect(normalizeGrade(3)).toBeNull();
  });
});

describe('srsStore.applyServer 등급 정화', () => {
  beforeEach(() => useSrsStore.getState().reset());

  it("서버의 'GOOD'·''·'perfect' 를 각각 'good'·null·null 로 들여온다", () => {
    useSrsStore.getState().applyServer({
      cards: { upper: remote('GOOD'), empty: remote(''), unknown: remote('perfect') },
      history: {},
    });
    const { cards } = useSrsStore.getState();
    expect(cards.upper.lastGrade).toBe('good');
    expect(cards.empty.lastGrade).toBeNull();
    expect(cards.unknown.lastGrade).toBeNull();
  });

  it('정상 값은 객체를 새로 만들지 않는다(불필요한 리렌더 방지)', () => {
    const clean = remote('again');
    useSrsStore.getState().applyServer({ cards: { c1: clean }, history: {} });
    expect(useSrsStore.getState().cards.c1).toBe(clean);
  });

  it('로컬이 더 최신이면 로컬이 이기고, 서버가 이겨도 등급은 정화된다', () => {
    // 서버 쪽이 더 나중에 복습한 상태 — 이때도 대문자가 그대로 들어오면 안 된다.
    useSrsStore.getState().applyServer({ cards: { c1: remote('EASY') }, history: {} });
    expect(useSrsStore.getState().cards.c1.lastGrade).toBe('easy');

    const older = { ...remote('GOOD'), lastReviewedAt: 1 };
    useSrsStore.getState().applyServer({ cards: { c1: older }, history: {} });
    expect(useSrsStore.getState().cards.c1.lastGrade).toBe('easy'); // 더 최신인 로컬 유지
  });
});
