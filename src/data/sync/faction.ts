import type { FactionId } from '../../constants/factions';
import { useFactionStore } from '../../store/factionStore';
import { isRestored, restoring, restored, useAccountRestoreStore } from '../../store/accountRestoreStore';
import { getSessionEpoch } from '../network/sessionEpoch';
import { factionRepository } from '../repositories';
import { ApiError } from '../network/errors';

/** A choice is committed locally only after the server accepts its immutable value. */
export async function confirmFaction(userId: string, id: FactionId): Promise<FactionId | null> {
  const entry = useAccountRestoreStore.getState().entries.faction;
  if (!isRestored(entry, userId)) return null;
  if (useFactionStore.getState().faction) return useFactionStore.getState().faction;
  const epoch = getSessionEpoch();
  restoring('faction', userId, epoch, 'saving');
  try {
    let confirmed = id;
    try { await factionRepository.set(id); }
    catch (error) {
      if (!(error instanceof ApiError) || error.kind !== 'conflict') throw error;
      const original = await factionRepository.get();
      if (!original) throw error;
      confirmed = original;
    }
    if (getSessionEpoch() !== epoch) return null;
    useFactionStore.getState().chooseFaction(confirmed);
    restored('faction', userId, epoch, 'ready');
    return confirmed;
  } catch {
    restored('faction', userId, epoch, 'error');
    return null;
  }
}
