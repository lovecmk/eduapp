// 백그라운드 복귀 정책 테스트 — '잠깐 나감' vs '오래 비움' vs '자정 넘김' 구분.
import React from 'react';
import { AppState } from 'react-native';
import { renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAppResume, STALE_BACKGROUND_MS } from '../useAppResume';
import { useDailyLearningStore } from '../../store/dailyLearningStore';
import { dateKey } from '../../utils/dateKey';

type Listener = (s: string) => void;

/** AppState.addEventListener 를 가로채 테스트에서 상태 전이를 직접 쏜다. */
function captureAppState() {
  const listeners: Listener[] = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_e: string, cb: Listener) => {
    listeners.push(cb);
    return { remove: () => listeners.splice(listeners.indexOf(cb), 1) };
  }) as never);
  return (status: string) => listeners.forEach((l) => l(status));
}

const setup = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const spy = jest.spyOn(client, 'invalidateQueries').mockImplementation(() => Promise.resolve());
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  renderHook(() => useAppResume(), { wrapper });
  return spy;
};

describe('useAppResume', () => {
  let emit: (status: string) => void;
  let now: number;

  beforeEach(() => {
    now = 1_700_000_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    emit = captureAppState();
    useDailyLearningStore.setState({ dayKey: dateKey(new Date()), newLearnedToday: 0 });
  });
  afterEach(() => jest.restoreAllMocks());

  it('잠깐(1분) 나갔다 오면 아무것도 갱신하지 않는다(로딩 깜빡임 방지)', () => {
    const spy = setup();
    emit('background');
    now += 60_000; // 1분
    emit('active');
    expect(spy).not.toHaveBeenCalled();
  });

  it('오래(5분 이상) 비우면 실시간성 데이터를 갱신한다', () => {
    const spy = setup();
    emit('background');
    now += STALE_BACKGROUND_MS + 1_000;
    emit('active');
    expect(spy).toHaveBeenCalled();
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys).toContain(JSON.stringify(['community-live']));
  });

  it('자정을 넘겨 복귀하면 오늘 기준 데이터(cards/stats)를 갱신한다', () => {
    const spy = setup();
    emit('background');
    now += 26 * 60 * 60_000; // 26시간 → 날짜 변경
    emit('active');
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys).toContain(JSON.stringify(['cards']));
    expect(keys).toContain(JSON.stringify(['stats']));
  });

  it('자정을 넘기면 어제 진행도가 남지 않도록 하루 할당량을 초기화한다', () => {
    setup();
    useDailyLearningStore.setState({ dayKey: '2000-1-1', newLearnedToday: 3 });
    emit('background');
    now += 26 * 60 * 60_000;
    emit('active');
    expect(useDailyLearningStore.getState().newLearnedToday).toBe(0);
    expect(useDailyLearningStore.getState().dayKey).toBe(dateKey(new Date()));
  });

  it('inactive(알림센터 등) 후 곧바로 복귀해도 오작동하지 않는다', () => {
    const spy = setup();
    emit('inactive');
    now += 2_000;
    emit('active');
    expect(spy).not.toHaveBeenCalled();
  });
});
