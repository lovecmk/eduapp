// 인증 가드 — 로그인하지 않은 사람이 보호된 화면에 남지 않게 하는 규칙.
//
// 과거 결함: 세션을 확인하는 곳이 진입점(app/index) 하나뿐이라, 딥링크·웹 새로고침·
// 생체인증 버튼·쓰는 도중의 세션 만료로는 로그아웃 상태 그대로 탭 화면에 들어갔다.

jest.mock('expo-router', () => ({ useRouter: jest.fn(), useSegments: jest.fn() }));
jest.mock('../../store/authStore', () => ({ useAuthStore: jest.fn() }));

import { needsLoginRedirect } from '../authGuard';

describe('needsLoginRedirect', () => {
  it('로그인한 사람은 어디에 있든 보내지 않는다', () => {
    expect(needsLoginRedirect(['(tabs)', 'cards'], true)).toBe(false);
    expect(needsLoginRedirect(['(auth)', 'login'], true)).toBe(false);
  });

  it('로그아웃 상태로 탭·설정·상세 화면에 있으면 로그인으로 보낸다', () => {
    expect(needsLoginRedirect(['(tabs)'], false)).toBe(true);
    expect(needsLoginRedirect(['(tabs)', 'cards'], false)).toBe(true);
    expect(needsLoginRedirect(['settings'], false)).toBe(true);
    expect(needsLoginRedirect(['content', '[id]'], false)).toBe(true);
  });

  it('로그인·가입 화면과 약관은 로그아웃 상태로도 열린다', () => {
    expect(needsLoginRedirect(['(auth)', 'login'], false)).toBe(false);
    expect(needsLoginRedirect(['(auth)', 'signup'], false)).toBe(false);
    expect(needsLoginRedirect(['legal'], false)).toBe(false);
  });

  it('진입점(index)은 스스로 갈 곳을 정하므로 건드리지 않는다', () => {
    expect(needsLoginRedirect([], false)).toBe(false);
  });
});
