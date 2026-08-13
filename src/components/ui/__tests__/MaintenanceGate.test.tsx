import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MaintenanceGate } from '../MaintenanceGate';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import { useAuthStore } from '../../../store/authStore';
import { defaultServiceConfig } from '../../../domain/models/ServiceConfig';
import type { ServiceConfig } from '../../../domain/models/ServiceConfig';
import type { User } from '../../../domain/models/User';

// 운영 상태는 서버에서 온다. 여기서 검사하려는 것은 "그 값이 화면을 덮는가"이므로
// 조회 자체는 흉내 내고 값만 바꾼다.
let mockConfig: ServiceConfig = defaultServiceConfig(3, 5);
const mockRefetch = jest.fn();
jest.mock('../../../hooks/useServiceConfig', () => ({
  useServiceConfig: () => ({ config: mockConfig, refetch: mockRefetch, isFetching: false }),
}));

const user = (isAdmin: boolean): User => ({
  id: 'u1',
  name: '김현장',
  email: 'a@b.c',
  membership: 'basic',
  isAdmin,
  createdAt: new Date(),
  isActive: true,
});

const wrap = () =>
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>
        <MaintenanceGate />
      </ThemeProvider>
    </SafeAreaProvider>,
  );

beforeEach(() => {
  mockConfig = defaultServiceConfig(3, 5);
  useAuthStore.setState({ user: null });
});

describe('MaintenanceGate — 점검 중에는 화면을 덮는다', () => {
  it('평상시에는 아무것도 그리지 않는다', () => {
    wrap();
    expect(screen.queryByText('서비스 점검 중')).toBeNull();
  });

  it('점검 중이면 이유를 덮어서 보여 준다', () => {
    // 배너 한 줄만 띄우면 사용자는 그 아래 화면을 계속 쓰다가, 채점에서야 실패한다.
    mockConfig = { ...mockConfig, maintenance: true, maintenanceMessage: '설비 교체 중' };
    wrap();
    expect(screen.getByText('서비스 점검 중')).toBeTruthy();
    expect(screen.getByText('설비 교체 중')).toBeTruthy();
  });

  it('서버가 문구를 주지 않아도 빈 화면을 덮지 않는다', () => {
    mockConfig = { ...mockConfig, maintenance: true, maintenanceMessage: '   ' };
    wrap();
    expect(screen.getByText(/점검이 끝나면 자동으로 열립니다/)).toBeTruthy();
  });

  it('관리자는 통과시킨다 — 점검이 끝났는지 확인할 사람이다', () => {
    // 서버도 점검 중 관리자 요청은 통과시킨다(docs/PLATFORM_SPLIT.md §5).
    mockConfig = { ...mockConfig, maintenance: true };
    useAuthStore.setState({ user: user(true) });
    wrap();
    expect(screen.queryByText('서비스 점검 중')).toBeNull();
  });

  it('설정을 읽지 못한 상태(기본값)로는 잠그지 않는다', () => {
    // 지하에서 잠깐 끊긴 것이 앱을 잠그는 이유가 되면 안 된다.
    useAuthStore.setState({ user: user(false) });
    wrap();
    expect(screen.queryByText('서비스 점검 중')).toBeNull();
  });
});
