import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
jest.mock('../../data/repositories', () => ({ communityRepository: { getSnapshot: jest.fn() } }));
import { communityRepository } from '../../data/repositories';
import { useCommunity } from '../useCommunity';

it('does not loop requests when failed sections remount and allows explicit recovery', async () => {
  const get = communityRepository.getSnapshot as jest.Mock;
  get.mockRejectedValue(new Error('isolated server error'));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const first = renderHook(() => useCommunity(), { wrapper });
  await waitFor(() => expect(first.result.current.isError).toBe(true));
  first.unmount();
  const second = renderHook(() => useCommunity(), { wrapper });
  expect(second.result.current.isError).toBe(true);
  expect(get).toHaveBeenCalledTimes(1);
  get.mockResolvedValue({ building: { current: { month: '2026-10' } } });
  await act(async () => { await second.result.current.refetch(); });
  await waitFor(() => expect(second.result.current.isSuccess).toBe(true));
  expect(get).toHaveBeenCalledTimes(2);
  second.unmount();
  client.clear();
});
