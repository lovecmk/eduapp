import type { IFactionRepository } from '../../domain/repositories/IFactionRepository';
import { toFactionId, type FactionId } from '../../constants/factions';
import { apiClient } from '../network/ApiClient';

/**
 * 내 진영(실서버) — docs/BACKEND_TODO §5.
 *  · GET  /inner/api/v1/me/faction  → { faction_cd: 'frost'|'flame'|'volt'|null }
 *  · POST /inner/api/v1/me/faction  { faction_cd }   (멱등키 — 같은 값이면 한 번)
 */
export class FactionRepository implements IFactionRepository {
  async get(): Promise<FactionId | null> {
    const dto = await apiClient.get<{ faction_cd?: string | null }>('/inner/api/v1/me/faction');
    return toFactionId(dto?.faction_cd ?? null);
  }

  async set(id: FactionId): Promise<void> {
    await apiClient.postDurable('/inner/api/v1/me/faction', { faction_cd: id }, `faction:${id}`);
  }
}
