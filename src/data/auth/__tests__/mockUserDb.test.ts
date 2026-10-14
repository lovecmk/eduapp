// AsyncStorage 를 얇게 흉내 낸다. 실제 저장소처럼 읽기/쓰기가 비동기라
// read → 수정 → write 사이에 다른 작업이 끼어들 수 있어야 경쟁 조건이 드러난다.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  const tick = () => new Promise((r) => setTimeout(r, 0));
  return {
    __esModule: true,
    default: {
      getItem: async (k: string) => { await tick(); return store.get(k) ?? null; },
      setItem: async (k: string, v: string) => { await tick(); store.set(k, v); },
      removeItem: async (k: string) => { await tick(); store.delete(k); },
      clear: async () => { store.clear(); },
    },
  };
});

import { mockUserDb } from '../../../__tests__/fixtures/data/auth/mockUserDb';
import type { User } from '../../../domain/models/User';

function account(id: string, username: string) {
  const user: User = {
    id,
    loginId: username,
    name: username,
    nickname: username,
    email: `${username}@example.com`,
    membership: 'basic',
    createdAt: new Date('2026-01-01'),
    isActive: true, isAdmin: false,
  };
  return { username, password: 'pw', user };
}

describe('mockUserDb 동시 쓰기', () => {
  it('동시에 가입해도 서로를 덮어쓰지 않는다', async () => {
    await Promise.all([
      mockUserDb.create(account('u-1', 'aaa')),
      mockUserDb.create(account('u-2', 'bbb')),
      mockUserDb.create(account('u-3', 'ccc')),
    ]);

    const users = await mockUserDb.listUsers();
    const ids = users.map((u) => u.id);
    // 직렬화하지 않으면 마지막 write 가 앞선 것들을 덮어 1~2명만 남는다.
    for (const id of ['u-1', 'u-2', 'u-3']) {
      expect(ids).toContain(id);
    }
  });

  it('가입 직후 프로필 수정이 겹쳐도 두 변경이 모두 남는다', async () => {
    await mockUserDb.create(account('u-9', 'ddd'));

    await Promise.all([
      mockUserDb.create(account('u-10', 'eee')),
      mockUserDb.updateUser('u-9', { name: '고친이름' }),
    ]);

    const users = await mockUserDb.listUsers();
    expect(users.find((u) => u.id === 'u-10')).toBeDefined();
    expect(users.find((u) => u.id === 'u-9')?.name).toBe('고친이름');
  });

  it('중복 아이디는 동시 요청에서도 한 번만 통과한다', async () => {
    const results = await Promise.allSettled([
      mockUserDb.create(account('u-20', 'same')),
      mockUserDb.create(account('u-21', 'same')),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    expect(ok).toHaveLength(1);
  });
});
