// 이메일 인증코드 보안 동작 테스트 — 코드 생성/비교가 화면이 아닌 저장소에서 일어나고,
// 만료·시도횟수·1회용 규칙이 지켜지는지 검증한다.

jest.mock('../../storage/secureStorage', () => {
  const store = new Map<string, string>();
  return {
    StorageKeys: { accessToken: 'accessToken', refreshToken: 'refreshToken', mockUser: 'mockUser' },
    secureStorage: {
      getItem: (k: string) => Promise.resolve(store.get(k) ?? null),
      setItem: (k: string, v: string) => { store.set(k, v); return Promise.resolve(); },
      removeItem: (k: string) => { store.delete(k); return Promise.resolve(); },
    },
  };
});
jest.mock('../../../__tests__/fixtures/data/auth/mockUserDb', () => ({ mockUserDb: {} }));
jest.mock('../_delay', () => ({ delay: () => Promise.resolve() }));

import { MockAuthRepository } from '../../../__tests__/fixtures/data/repositories/AuthRepository.mock';

const EMAIL = 'user@example.com';

describe('MockAuthRepository 이메일 인증', () => {
  let repo: MockAuthRepository;
  beforeEach(() => { repo = new MockAuthRepository(); });

  it('발송하면 6자리 코드가 만들어진다(데모 프리뷰)', async () => {
    const { devPreviewCode } = await repo.requestEmailCode(EMAIL);
    expect(devPreviewCode).toMatch(/^\d{6}$/);
  });

  it('올바른 코드는 검증에 성공한다', async () => {
    const { devPreviewCode } = await repo.requestEmailCode(EMAIL);
    expect(await repo.verifyEmailCode(EMAIL, devPreviewCode!)).toBe(true);
  });

  it('틀린 코드는 실패한다', async () => {
    await repo.requestEmailCode(EMAIL);
    expect(await repo.verifyEmailCode(EMAIL, '000000')).toBe(false);
  });

  it('발송 없이 검증하면 실패한다', async () => {
    expect(await repo.verifyEmailCode(EMAIL, '123456')).toBe(false);
  });

  it('코드는 1회용 — 성공 후 재사용하면 실패한다', async () => {
    const { devPreviewCode } = await repo.requestEmailCode(EMAIL);
    expect(await repo.verifyEmailCode(EMAIL, devPreviewCode!)).toBe(true);
    expect(await repo.verifyEmailCode(EMAIL, devPreviewCode!)).toBe(false);
  });

  it('다른 이메일의 코드로는 검증되지 않는다', async () => {
    const { devPreviewCode } = await repo.requestEmailCode(EMAIL);
    expect(await repo.verifyEmailCode('other@example.com', devPreviewCode!)).toBe(false);
  });

  it('이메일 대소문자·공백은 정규화해 동일하게 취급한다', async () => {
    const { devPreviewCode } = await repo.requestEmailCode('  User@Example.COM ');
    expect(await repo.verifyEmailCode(EMAIL, devPreviewCode!)).toBe(true);
  });

  it('재발송하면 이전 코드는 무효가 된다', async () => {
    const first = (await repo.requestEmailCode(EMAIL)).devPreviewCode!;
    const second = (await repo.requestEmailCode(EMAIL)).devPreviewCode!;
    if (first !== second) {
      expect(await repo.verifyEmailCode(EMAIL, first)).toBe(false);
    }
    expect(await repo.verifyEmailCode(EMAIL, second)).toBe(true);
  });

  it('시도 5회를 초과하면 코드가 무효화된다(무차별 대입 방지)', async () => {
    const { devPreviewCode } = await repo.requestEmailCode(EMAIL);
    for (let i = 0; i < 5; i++) {
      expect(await repo.verifyEmailCode(EMAIL, '000000')).toBe(false);
    }
    // 시도 초과 후에는 정답 코드도 거부된다 → 재발송 필요
    expect(await repo.verifyEmailCode(EMAIL, devPreviewCode!)).toBe(false);
  });

  it('만료(5분 초과)된 코드는 거부된다', async () => {
    const { devPreviewCode } = await repo.requestEmailCode(EMAIL);
    const realNow = Date.now;
    Date.now = () => realNow() + 6 * 60 * 1000; // 6분 경과
    try {
      expect(await repo.verifyEmailCode(EMAIL, devPreviewCode!)).toBe(false);
    } finally {
      Date.now = realNow;
    }
  });
});
