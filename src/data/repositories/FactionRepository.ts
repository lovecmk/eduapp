import type { IFactionRepository } from '../../domain/repositories/IFactionRepository';
import { toFactionId, type FactionId } from '../../constants/factions';
import { apiClient } from '../network/ApiClient';
import { ApiError } from '../network/errors';

/**
 * 내 진영(실서버) — docs/BACKEND_TODO §5.
 *  · GET  /inner/api/v1/me/faction  → { faction_cd: 'frost'|'flame'|'volt'|null }
 *  · POST /inner/api/v1/me/faction  { faction_cd }   (멱등키 — 같은 값이면 한 번)
 */
export class FactionRepository implements IFactionRepository {
  async get(): Promise<FactionId | null> {
    const dto = await apiClient.get<{ faction_cd?: string | null }>('/inner/api/v1/me/faction');
    if (!dto || !Object.hasOwn(dto, 'faction_cd')) throw new ApiError(502, '진영 복원 응답을 확인하지 못했어요.');
    if (dto.faction_cd === null || dto.faction_cd === '') return null;
    const id = toFactionId(dto.faction_cd);
    if (!id) throw new ApiError(502, '저장된 진영을 확인하지 못했어요.');
    return id;
  }

  async set(id: FactionId): Promise<void> {
    const dto = await apiClient.post<{ faction_cd?: string }>('/inner/api/v1/me/faction', { faction_cd: id });
    if (dto?.faction_cd !== id) throw new ApiError(502, '진영 저장 결과를 확인하지 못했어요.');
  }
}
