import fs from 'fs';
import path from 'path';

/**
 * persist 스토어는 하나도 빠짐없이 '누구의 것인가'가 정해져 있어야 한다.
 *
 * 공용 태블릿에서 A 가 로그아웃하고 B 가 로그인하면 sessionScope 가 사용자
 * 종속 데이터를 지운다. 그 목록(USER_SCOPED_PERSIST_KEYS)에 빠진 스토어는
 * **앞사람 것이 뒷사람 화면에 그대로 남고**, 실서버 모드에서는 그 로컬 진행도가
 * 뒷사람 토큰으로 서버에 올라가 안전교육 이력이 엉뚱한 사람에게 붙는다.
 *
 * 스토어를 새로 만들 때 목록에 추가하는 것을 잊는 일은 반드시 일어난다 —
 * 주석으로는 못 막는다. 여기서 막는다: 분류되지 않은 persist 키가 생기면
 * 이 테스트가 먼저 실패하고, 개발자는 둘 중 하나를 **의식적으로** 고른다.
 */

const STORE_DIR = path.resolve(__dirname, '..');

/**
 * 사람이 바뀌어도 남기는 기기 단위 저장소 — 여기에 넣는 것은 결정이다.
 *  · app-settings  기기 취향(테마·글자 크기). 계정 설정은 따로 초기화된다.
 *  · app-moments   그 기기의 첫 실행 시각·누적 실행 횟수.
 *  · server-policy 운영자가 정한 하루 출제 범위(사람이 아니라 서비스의 값).
 */
const DEVICE_SCOPED = ['app-settings', 'app-moments', 'server-policy'];

function persistNames(): string[] {
  const names = new Set<string>();
  for (const file of fs.readdirSync(STORE_DIR)) {
    if (!file.endsWith('.ts')) continue;
    const src = fs.readFileSync(path.join(STORE_DIR, file), 'utf8');
    if (!src.includes('persist(')) continue;
    for (const m of src.matchAll(/name:\s*'([^']+)'/g)) names.add(m[1]);
  }
  return [...names].sort();
}

function userScopedKeys(): string[] {
  const src = fs.readFileSync(path.join(STORE_DIR, 'sessionScope.ts'), 'utf8');
  const block = src.match(/USER_SCOPED_PERSIST_KEYS\s*=\s*\[([\s\S]*?)\]/);
  if (!block) throw new Error('USER_SCOPED_PERSIST_KEYS 를 찾지 못했다');
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
}

describe('persist 스토어의 주인', () => {
  it('모든 persist 키가 사용자 종속·기기 단위 중 하나로 분류돼 있다', () => {
    const classified = new Set([...userScopedKeys(), ...DEVICE_SCOPED]);
    const unclassified = persistNames().filter((n) => !classified.has(n));
    expect(unclassified).toEqual([]);
  });

  it('사용자 종속 목록에 실재하지 않는 키가 남아 있지 않다', () => {
    const actual = new Set(persistNames());
    const stale = userScopedKeys().filter((k) => !actual.has(k));
    expect(stale).toEqual([]);
  });

  it('기기 단위로 분류한 것이 실제로 존재한다(오타로 빠져나가지 않게)', () => {
    const actual = new Set(persistNames());
    expect(DEVICE_SCOPED.filter((k) => !actual.has(k))).toEqual([]);
  });

  it('메모리 초기화(resetUserScopedStores)가 디스크 목록만큼 스토어를 건드린다', () => {
    // 디스크만 지우고 메모리를 남기면, 남은 스토어가 다음 setState 때 그대로
    // 다시 써져 되살아난다(persist). 두 목록의 크기가 갈리면 그 신호다.
    const reset = fs.readFileSync(path.join(STORE_DIR, 'resetAppData.ts'), 'utf8');
    const body = reset.match(/export function resetUserScopedStores\(\): void \{([\s\S]*?)\n\}/);
    if (!body) throw new Error('resetUserScopedStores 를 찾지 못했다');
    const touched = body[1].split('\n').filter((l) => l.trim().startsWith('use') || l.trim().startsWith('reset')).length;
    expect(touched).toBeGreaterThanOrEqual(userScopedKeys().length);
  });
});
