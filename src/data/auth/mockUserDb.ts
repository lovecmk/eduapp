// 목업 사용자 저장소 — 실제 백엔드(회원 DB)가 붙기 전까지
// AsyncStorage 에 계정을 보관해 회원가입/로그인/비밀번호 찾기를 실제처럼 동작시킨다.
// 실서버 전환 시 이 파일은 통째로 폐기되고 AuthRepository(HTTP) 가 대체한다.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '../../domain/models/User';

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
      email: 'won@example.com',
      org: '안전관리본부',
      jobTitle: '현장 안전관리자',
      membership: 'premium',
      createdAt: new Date('2025-01-01'),
      isActive: true,
    },
  },
  {
    username: '김현장',
    password: 'demo1234',
    user: {
      id: 'u-kim',
      name: '김현장',
      email: 'kim@example.com',
      org: '안전관리본부',
      jobTitle: '현장 안전관리자',
      membership: 'premium',
      createdAt: new Date('2025-01-01'),
      isActive: true,
    },
  },
];

function reviveDates(accounts: MockAccount[]): MockAccount[] {
  return accounts.map((a) => ({ ...a, user: { ...a.user, createdAt: new Date(a.user.createdAt) } }));
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

export const mockUserDb = {
  async find(username: string): Promise<MockAccount | undefined> {
    const all = await readAll();
    return all.find((a) => a.username.toLowerCase() === username.trim().toLowerCase());
  },

  async isTaken(username: string): Promise<boolean> {
    return !!(await this.find(username));
  },

  async create(account: MockAccount): Promise<void> {
    const all = await readAll();
    if (all.some((a) => a.username.toLowerCase() === account.username.trim().toLowerCase())) {
      throw new Error('이미 사용 중인 아이디입니다');
    }
    all.push(account);
    await writeAll(all);
  },

  async updatePassword(username: string, email: string, newPassword: string): Promise<void> {
    const all = await readAll();
    const idx = all.findIndex(
      (a) =>
        a.username.toLowerCase() === username.trim().toLowerCase() &&
        a.user.email.toLowerCase() === email.trim().toLowerCase(),
    );
    if (idx === -1) throw new Error('아이디와 이메일이 일치하는 계정을 찾을 수 없습니다');
    all[idx] = { ...all[idx], password: newPassword };
    await writeAll(all);
  },

  /** 관리 콘솔용 — 전체 계정 목록(비밀번호 제외). */
  async listUsers(): Promise<User[]> {
    const all = await readAll();
    return all.map((a) => a.user);
  },
};
