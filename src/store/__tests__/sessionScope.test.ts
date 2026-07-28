/**
 * 공용 기기에서 앞사람 데이터가 뒷사람에게 넘어가지 않는지 — 세션 주인 강제 테스트.
 */
const store = new Map<string, string>();
let getItemImpl: (k: string) => Promise<string | null> = async (k) => store.get(k) ?? null;

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (k: string) => getItemImpl(k),
    setItem: async (k: string, v: string) => void store.set(k, v),
    removeItem: async (k: string) => void store.delete(k),
    multiRemove: async (keys: string[]) => keys.forEach((k) => store.delete(k)),
  },
}));

const purgeMemory = jest.fn();
jest.mock('../resetAppData', () => ({ resetLearningStores: () => purgeMemory() }));

const clearCache = jest.fn();
jest.mock('../../data/network/queryClient', () => ({ queryClient: { clear: () => clearCache() } }));

const setStateSpy = jest.fn();
const fakeStore = { setState: (v: unknown) => setStateSpy(v) };
jest.mock('../qnaStore', () => ({ useQnaStore: fakeStore }));
jest.mock('../shareFeedStore', () => ({ useShareFeedStore: fakeStore }));
jest.mock('../tipStore', () => ({ useTipStore: fakeStore }));

import {
  applySessionOwner,
  clearSessionOwner,
  USER_SCOPED_PERSIST_KEYS,
  __resetSessionScopeForTests,
} from '../sessionScope';

beforeEach(() => {
  store.clear();
  getItemImpl = async (k) => store.get(k) ?? null;
  purgeMemory.mockClear();
  clearCache.mockClear();
  setStateSpy.mockClear();
  __resetSessionScopeForTests();
});

describe('applySessionOwner', () => {
  it('첫 로그인(주인 기록 없음)에서는 아무것도 지우지 않는다', async () => {
    await applySessionOwner('user-a');
    expect(purgeMemory).not.toHaveBeenCalled();
  });

  it('같은 사람이 다시 로그인하면 학습 데이터를 유지한다', async () => {
    await applySessionOwner('user-a');
    await applySessionOwner(null); // 로그아웃
    await applySessionOwner('user-a'); // 재로그인
    expect(purgeMemory).not.toHaveBeenCalled();
  });

  it('다른 사람이 로그인하면 사용자 종속 데이터를 메모리·디스크에서 비운다', async () => {
    await applySessionOwner('user-a');
    USER_SCOPED_PERSIST_KEYS.forEach((k) => store.set(k, '{"state":{}}'));
    store.set('app-settings', '{"state":{"theme":"dark"}}');

    await applySessionOwner('user-b');

    expect(purgeMemory).toHaveBeenCalledTimes(1);
    USER_SCOPED_PERSIST_KEYS.forEach((k) => expect(store.has(k)).toBe(false));
    // 기기 설정(테마·폰트)은 사람이 바뀌어도 남는다.
    expect(store.has('app-settings')).toBe(true);
  });

  it('로그아웃 없이 계정이 바뀌어도(세션 만료·강제종료) 정리된다', async () => {
    await applySessionOwner('user-a');
    __resetSessionScopeForTests(); // 앱 재시작 — 메모리는 비었고 디스크 주인만 남음
    await applySessionOwner('user-b');
    expect(purgeMemory).toHaveBeenCalledTimes(1);
  });

  it('로그아웃은 서버 응답 캐시를 비우되 학습 데이터는 남긴다', async () => {
    await applySessionOwner('user-a');
    clearCache.mockClear();
    await applySessionOwner(null);
    expect(clearCache).toHaveBeenCalled();
    expect(purgeMemory).not.toHaveBeenCalled();
  });

  it('주인 기록을 읽지 못하면 같은 사람임을 증명할 수 없으므로 지운다(fail-closed)', async () => {
    getItemImpl = async () => {
      throw new Error('저장소 손상');
    };
    await applySessionOwner('user-a');
    expect(purgeMemory).toHaveBeenCalledTimes(1);
  });

  it('겹쳐 들어온 세션 전환을 순서대로 처리한다(restore 와 login 동시 진행)', async () => {
    await applySessionOwner('user-a');
    await Promise.all([applySessionOwner('user-a'), applySessionOwner('user-b')]);
    // a→a 는 통과, a→b 에서 정확히 한 번만 지워야 한다.
    expect(purgeMemory).toHaveBeenCalledTimes(1);
    expect(store.get('session-owner-id')).toBe('user-b');
  });

  it('clearSessionOwner 뒤의 첫 로그인은 지우지 않는다(초기화 직후)', async () => {
    await applySessionOwner('user-a');
    await clearSessionOwner();
    await applySessionOwner('user-b');
    expect(purgeMemory).not.toHaveBeenCalled();
  });
});
