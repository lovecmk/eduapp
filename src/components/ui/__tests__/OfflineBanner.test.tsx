import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react-native';
import NetInfo from '@react-native-community/netinfo';
import { OfflineBanner } from '../OfflineBanner';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import { enqueue, clearQueue, __resetQueueForTests } from '../../../data/network/offlineQueue';
import { apiClient } from '../../../data/network/ApiClient';
import { setLogSink, resetLogSink } from '../../../utils/logger';

// NetInfo 는 네이티브 모듈이라 테스트에서 직접 구동할 수 없다.
// 리스너를 붙잡아 두고 테스트가 연결 상태 변화를 직접 흉내 낸다.
let emit: (s: { isConnected: boolean }) => void = () => {};
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn() },
}));

beforeAll(() => setLogSink(() => {}));
afterAll(() => resetLogSink());

beforeEach(async () => {
  __resetQueueForTests();
  await clearQueue();
  (NetInfo.addEventListener as jest.Mock).mockImplementation((cb: typeof emit) => {
    emit = cb;
    return () => {};
  });
});

const wrap = () => render(<ThemeProvider><OfflineBanner /></ThemeProvider>);

describe('OfflineBanner — 연결 상태와 대기 중인 쓰기 안내', () => {
  it('연결이 정상이면 아무것도 그리지 않는다(평소엔 조용해야 한다)', () => {
    const { toJSON } = wrap();
    act(() => emit({ isConnected: true }));
    expect(toJSON()).toBeNull();
  });

  it('끊기면 기록이 저장된다는 사실을 알린다', async () => {
    wrap();
    act(() => emit({ isConnected: false }));
    await waitFor(() => expect(screen.getByText(/학습 기록은 안전하게 저장돼요/)).toBeTruthy());
  });

  it('대기 중인 쓰기가 있으면 건수를 함께 보여준다', async () => {
    await enqueue('POST', '/api/progress/attendance', { day: '2026-7-26' });
    await enqueue('POST', '/api/reports', { card_id: 'c1' });
    wrap();
    act(() => emit({ isConnected: false }));
    await waitFor(() => expect(screen.getByText(/2건은 연결되면 자동 전송돼요/)).toBeTruthy());
  });

  it('복귀하면 쌓인 쓰기를 전송하고 결과를 짧게 알린다', async () => {
    const flush = jest.spyOn(apiClient, 'flushPendingWrites').mockResolvedValue(3);
    await enqueue('POST', '/api/progress/attendance', { day: '2026-7-26' });
    wrap();
    act(() => emit({ isConnected: false }));
    await waitFor(() => expect(screen.getByText(/자동 전송돼요/)).toBeTruthy());

    await act(async () => { emit({ isConnected: true }); });
    await waitFor(() => expect(screen.getByText(/3건을 전송했어요/)).toBeTruthy());
    expect(flush).toHaveBeenCalled();
    flush.mockRestore();
  });

  it('보낼 것이 없으면 복귀해도 알리지 않는다(불필요한 알림 방지)', async () => {
    const flush = jest.spyOn(apiClient, 'flushPendingWrites').mockResolvedValue(0);
    const { toJSON } = wrap();
    act(() => emit({ isConnected: false }));
    await waitFor(() => expect(screen.getByText(/저장돼요/)).toBeTruthy());

    await act(async () => { emit({ isConnected: true }); });
    await waitFor(() => expect(toJSON()).toBeNull());
    flush.mockRestore();
  });

  it('앱을 켜자마자 온라인이면 전송을 시도하지 않는다(끊긴 적이 없으므로)', async () => {
    const flush = jest.spyOn(apiClient, 'flushPendingWrites').mockResolvedValue(0);
    wrap();
    await act(async () => { emit({ isConnected: true }); });
    expect(flush).not.toHaveBeenCalled();
    flush.mockRestore();
  });
});
