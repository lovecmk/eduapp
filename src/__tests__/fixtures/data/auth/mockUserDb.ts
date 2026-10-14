// 목업 사용자 저장소 — 실제 백엔드(회원 DB)가 붙기 전까지
// AsyncStorage 에 계정을 보관해 회원가입/로그인/비밀번호 찾기를 실제처럼 동작시킨다.
// 실서버 전환 시 이 파일은 통째로 폐기되고 AuthRepository(HTTP) 가 대체한다.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '../../../../domain/models/User';
import { ADMIN_DEMO_USER } from './adminDemoAccount';

export interface MockAccount {
  username: string;
  password: string;
  user: User;
}

const DB_KEY = 'mock-user-db';

// 데모 계정 — 회의/시연용. (아이디 / 비밀번호)
const SEED: MockAccount[] = [
  {
    username: '원진섭',
    password: 'demo1234',
    user: {
      id: 'u-wonjinseop',
      name: '원진섭',
      nickname: '불끄는진섭',
      email: 'won@example.com',
      org: '안전관리본부',
      jobTitle: '현장 안전관리자',
      membership: 'premium',
      createdAt: new Date('2025-01-01'),
      isActive: true, isAdmin: false,
    },
  },
  {
    username: '김현장',
    password: 'demo1234',
    user: {
      id: 'u-kim',
      name: '김현장',
      nickname: '현장왕김씨',
      email: 'kim@example.com',
      org: '안전관리본부',
      jobTitle: '현장 안전관리자',
      membership: 'premium',
      createdAt: new Date('2025-01-01'),
      isActive: true, isAdmin: false,
    },
  },
  // 관리자 모드 데모 계정 — 로그인 화면 로고 5번 두드리기로도 들어온다(adminDemoAccount).
  // 목업 모드에서는 아이디/비밀번호로도 그대로 로그인되도록 여기 함께 심어 둔다.
  {
    username: ADMIN_DEMO_USER.loginId ?? ADMIN_DEMO_USER.name,
    password: 'demo1234',
    user: ADMIN_DEMO_USER,
  },
];

function reviveDates(accounts: MockAccount[]): MockAccount[] {
  // loginId 는 표시 전용 파생값 — 저장소에 없으면 username 으로 백필한다.
  return accounts.map((a) => ({
    ...a,
    user: { ...a.user, loginId: a.user.loginId ?? a.username, createdAt: new Date(a.user.createdAt) },
  }));
}

async function readAll(): Promise<MockAccount[]> {
  try {
    const raw = await AsyncStorage.getItem(DB_KEY);
    if (!raw) {
      await AsyncStorage.setItem(DB_KEY, JSON.stringify(SEED));
      return reviveDates(SEED);
    }
    return reviveDates(JSON.parse(raw) as MockAccount[]);
  } catch {
    return reviveDates(SEED);
  }
}

async function writeAll(accounts: MockAccount[]): Promise<void> {
  await AsyncStorage.setItem(DB_KEY, JSON.stringify(accounts));
}

/**
 * 쓰기 작업을 한 줄로 세운다.
 *
 * 모든 변경이 read → 수정 → write 라, 두 개가 겹치면 나중 write 가 먼저 것의 결과를
 * 통째로 덮는다(회원가입 직후 프로필 수정 같은 흐름에서 실제로 겹친다).
 * 진짜 DB 라면 트랜잭션이 할 일을, 목업에서는 이 프로미스 체인이 대신한다.
 */
let writeLock: Promise<unknown> = Promise.resolve();

function serialize<T>(op: () => Promise<T>): Promise<T> {
  const next = writeLock.then(op, op);
  // 앞선 작업이 실패해도 줄이 끊기지 않게 한다(거부는 호출부가 받는다).
  writeLock = next.catch(() => undefined);
  return next;
}

export const mockUserDb = {
  async find(username: string): Promise<MockAccount | undefined> {
    const all = await readAll();
    return all.find((a) => a.username.toLowerCase() === username.trim().toLowerCase());
  },

  async isTaken(username: string): Promise<boolean> {
    return !!(await this.find(username));
  },

  /** 닉네임 중복 여부. excludeUserId 를 넘기면 그 사용자 본인은 제외한다. */
  async isNicknameTaken(nickname: string, excludeUserId?: string): Promise<boolean> {
    const target = nickname.trim().toLowerCase();
    if (!target) return false;
    const all = await readAll();
    return all.some(
      (a) =>
        a.user.id !== excludeUserId &&
        (a.user.nickname ?? '').trim().toLowerCase() === target,
    );
  },

  async create(account: MockAccount): Promise<void> {
    return serialize(async () => {
      const all = await readAll();
      if (all.some((a) => a.username.toLowerCase() === account.username.trim().toLowerCase())) {
        throw new Error('이미 사용 중인 아이디입니다');
      }
      const nick = (account.user.nickname ?? '').trim().toLowerCase();
      if (nick && all.some((a) => (a.user.nickname ?? '').trim().toLowerCase() === nick)) {
        throw new Error('이미 사용 중인 닉네임입니다');
      }
      all.push(account);
      await writeAll(all);
    });
  },

  /** 사용자 프로필(계정)을 부분 갱신하고 갱신된 User 를 반환. */
  async updateUser(userId: string, patch: Partial<User>): Promise<User> {
    return serialize(async () => {
      const all = await readAll();
      const idx = all.findIndex((a) => a.user.id === userId);
      if (idx === -1) throw new Error('사용자를 찾을 수 없습니다');
      if (patch.nickname !== undefined) {
        const nick = patch.nickname.trim().toLowerCase();
        if (nick && all.some((a, i) => i !== idx && (a.user.nickname ?? '').trim().toLowerCase() === nick)) {
          throw new Error('이미 사용 중인 닉네임입니다');
        }
      }
      const updated: User = { ...all[idx].user, ...patch };
      all[idx] = { ...all[idx], user: updated };
      await writeAll(all);
      return updated;
    });
  },

  /** 아이디 또는 가입 이메일이 일치하는 계정의 비밀번호를 재설정.
   *  (username/email 두 인자에 같은 식별자를 넘기면 아이디·이메일 중 하나만 맞아도 됨) */
  async updatePassword(username: string, email: string, newPassword: string): Promise<void> {
    return serialize(async () => {
      const all = await readAll();
      const uid = username.trim().toLowerCase();
      const eid = email.trim().toLowerCase();
      const idx = all.findIndex(
        (a) =>
          (!!uid && a.username.toLowerCase() === uid) ||
          (!!eid && a.user.email.toLowerCase() === eid),
      );
      if (idx === -1) throw new Error('일치하는 계정을 찾을 수 없습니다 (아이디 또는 가입 이메일 확인)');
      all[idx] = { ...all[idx], password: newPassword };
      await writeAll(all);
    });
  },

  /** 관리 콘솔용 — 전체 계정 목록(비밀번호 제외). */
  async listUsers(): Promise<User[]> {
    const all = await readAll();
    return all.map((a) => a.user);
  },
};
