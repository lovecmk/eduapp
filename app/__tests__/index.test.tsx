// 진입점 라우팅 회귀 테스트.
// 과거 버그: 세션이 복구돼 있어도 무조건 로그인으로 보내, 재실행·새로고침마다
// 다시 로그인해야 했다. 세션 유무에 따라 목적지가 갈리는지 고정한다.

// jest.mock 은 import 위로 끌어올려지므로, 팩토리에서 참조할 변수는 `mock` 접두사가 필요하다.
const mockRedirect = jest.fn((_props: unknown) => null);
jest.mock('expo-router', () => ({ Redirect: (props: unknown) => mockRedirect(props) }));

import React from 'react';
import { render } from '@testing-library/react-native';
import Index from '../index';
import { useAuthStore } from '../../src/store/authStore';
import { ROUTES } from '../../src/constants/routes';
import type { User } from '../../src/domain/models/User';

const someUser: User = {
  id: 'u-1',
  name: '원진섭',
  email: 'won@example.com',
  membership: 'basic',
  createdAt: new Date(),
  isActive: true,
};

const setAuth = (patch: Partial<{ bootstrapped: boolean; user: User | null }>) => {
  useAuthStore.setState(patch as never);
};

describe('app/index 진입 라우팅', () => {
  beforeEach(() => mockRedirect.mockClear());

  it('복구가 끝나기 전에는 아무 곳으로도 보내지 않는다(성급한 리다이렉트 방지)', () => {
    setAuth({ bootstrapped: false, user: null });
    render(<Index />);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('세션이 없으면 로그인으로 보낸다', () => {
    setAuth({ bootstrapped: true, user: null });
    render(<Index />);
    expect(mockRedirect).toHaveBeenCalledWith(expect.objectContaining({ href: ROUTES.login }));
  });

  it('세션이 복구되어 있으면 홈으로 보낸다(재로그인 요구하지 않음)', () => {
    setAuth({ bootstrapped: true, user: someUser });
    render(<Index />);
    expect(mockRedirect).toHaveBeenCalledWith(expect.objectContaining({ href: ROUTES.home }));
  });
});
