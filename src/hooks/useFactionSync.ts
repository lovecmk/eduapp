import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { useFactionStore } from '../store/factionStore';
import { factionRepository } from '../data/repositories';
import { ApiError } from '../data/network/errors';
import { getSessionEpoch } from '../data/network/sessionEpoch';
import { waitForHydration } from '../data/storage/hydration';
import { restoring, restored, useAccountRestoreStore } from '../store/accountRestoreStore';

/** Read the server's immutable faction before onboarding or migrating a legacy local choice. */
export function useFactionSync(): void {
  const userId = useAuthStore(s => s.user?.id ?? null);
  const retry = useAccountRestoreStore(s => s.retry);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false, running = false;
    const epoch = getSessionEpoch();
    const active = () => !cancelled && epoch === getSessionEpoch();
    const pull = async () => {
      const entry = useAccountRestoreStore.getState().entries.faction;
      if (!active() || running || entry?.userId === userId && entry.epoch === epoch && entry.status === 'saving') return;
      running = true;
      restoring('faction', userId, epoch);
      try {
        await waitForHydration(useFactionStore);
        if (!active()) return;
        let server = await factionRepository.get();
        if (!active()) return;
        const local = useFactionStore.getState().faction;
        if (!server && local) {
          try { await factionRepository.set(local); server = local; }
          catch (error) {
            if (!(error instanceof ApiError) || error.kind !== 'conflict') throw error;
            server = await factionRepository.get();
            if (!server) throw error;
          }
        }
        if (!active()) return;
        if (server) useFactionStore.getState().chooseFaction(server);
        restored('faction', userId, epoch, 'ready');
      } catch {
        if (active()) restored('faction', userId, epoch, 'error');
      } finally { running = false; }
    };
    void pull();
    const sub = AppState.addEventListener('change', state => { if (state === 'active') void pull(); });
    return () => { cancelled = true; sub.remove(); };
  }, [userId, retry]);
}
