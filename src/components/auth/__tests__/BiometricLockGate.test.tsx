// 생체인증 잠금 — 설정 스위치가 실제로 앱을 잠그고, 지문으로만 열리는가.
//
// 과거 결함: 설정의 '생체인증 로그인' 값은 아무도 읽지 않았고, 로그인 화면의
// '생체인증으로 로그인' 버튼은 지문이 맞으면 **세션 없이** 홈으로 보냈다.

const mockAuthenticate = jest.fn<Promise<boolean>, [string]>();
jest.mock('../../../data/auth/BiometricAuth', () => ({
  isBiometricAvailable: jest.fn(async () => true),
  authenticateWithBiometrics: (p: string) => mockAuthenticate(p),
}));

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BiometricLockGate } from '../BiometricLockGate';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import { useAuthStore } from '../../../store/authStore';
import { useSettingsStore } from '../../../store/settingsStore';
import type { User } from '../../../domain/models/User';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const someUser: User = {
  id: 'u-1', name: '원진섭', email: 'won@example.com', membership: 'basic',
  createdAt: new Date(), isActive: true, isAdmin: false,
};
const wrap = () =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>
        <BiometricLockGate />
      </ThemeProvider>
    </SafeAreaProvider>,
  );

beforeEach(() => {
  mockAuthenticate.mockReset();
  useSettingsStore.setState({ biometricLoginEnabled: true });
  useAuthStore.setState({ user: someUser, needsUnlock: true });
});
afterEach(() => useSettingsStore.setState({ biometricLoginEnabled: false }));

describe('BiometricLockGate', () => {
  it('설정이 꺼져 있으면 덮지 않는다', () => {
    useSettingsStore.setState({ biometricLoginEnabled: false });
    wrap();
    expect(screen.queryByText('잠겨 있어요')).toBeNull();
  });

  it('방금 비밀번호로 들어온 실행(needsUnlock=false)은 덮지 않는다', () => {
    useAuthStore.setState({ needsUnlock: false });
    wrap();
    expect(screen.queryByText('잠겨 있어요')).toBeNull();
  });

  it('되살아난 세션은 덮고, 곧바로 지문을 묻고, 통과하면 연다', async () => {
    mockAuthenticate.mockResolvedValue(true);
    wrap();
    expect(screen.getByText('잠겨 있어요')).toBeTruthy();
    await waitFor(() => expect(mockAuthenticate).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('잠겨 있어요')).toBeNull());
    expect(useAuthStore.getState().needsUnlock).toBe(false);
  });

  it('실패하면 그대로 잠겨 있고 다시 시도할 수 있다', async () => {
    mockAuthenticate.mockResolvedValue(false);
    wrap();
    await waitFor(() => expect(screen.getByText('확인하지 못했어요. 다시 시도해 주세요.')).toBeTruthy());
    expect(useAuthStore.getState().needsUnlock).toBe(true);

    mockAuthenticate.mockResolvedValue(true);
    fireEvent.press(screen.getByText('잠금 해제'));
    await waitFor(() => expect(useAuthStore.getState().needsUnlock).toBe(false));
  });
});
