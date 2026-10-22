import { create } from 'zustand';
import { getSessionEpoch } from '../data/network/sessionEpoch';

export type AccountResource = 'faction' | 'progress' | 'settings' | 'collection' | 'engagement' | 'notifications';
export interface RestoreEntry { userId: string; epoch: number; status: 'loading' | 'saving' | 'ready' | 'error' }
interface AccountRestoreState {
  entries: Partial<Record<AccountResource, RestoreEntry>>;
  retry: number;
  retryFailed: () => void;
}
export const useAccountRestoreStore = create<AccountRestoreState>(set => ({
  entries: {}, retry: 0, retryFailed: () => set(s => ({ retry: s.retry + 1 })),
}));
export function restoring(resource: AccountResource, userId: string, epoch: number, status: 'loading' | 'saving' = 'loading') {
  useAccountRestoreStore.setState(s => ({ entries: { ...s.entries, [resource]: { userId, epoch, status } } }));
}
export function restored(resource: AccountResource, userId: string, epoch: number, status: 'ready' | 'error') {
  const entry = useAccountRestoreStore.getState().entries[resource];
  if (getSessionEpoch() !== epoch || entry?.userId !== userId || entry.epoch !== epoch) return;
  useAccountRestoreStore.setState(s => ({ entries: { ...s.entries, [resource]: { userId, epoch, status } } }));
}
export function isRestored(entry: RestoreEntry | undefined, userId: string | undefined): boolean {
  return !!userId && entry?.userId === userId && entry.epoch === getSessionEpoch() && entry.status === 'ready';
}
