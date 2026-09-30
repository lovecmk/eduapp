import type { FactionId } from '../../constants/factions';

/**
 * 내 진영 — 서버 `/inner/api/v1/me/faction`(미배포 → 이 기기에만).
 *
 * 진영은 기기가 아니라 사람에게 붙는다. 서버가 알아야 진영 대항전을 진영별로 집계할 수
 * 있고(BuildingMonth.factions), 기기를 바꾼 사람이 진영을 다시 고르지 않는다.
 */
export interface IFactionRepository {
  /** 서버에 기록된 내 진영. 기록이 없으면 null. */
  get(): Promise<FactionId | null>;
  set(id: FactionId): Promise<void>;
}
