import type { IFactionRepository } from '../../../../domain/repositories/IFactionRepository';
import type { FactionId } from '../../../../constants/factions';
import { useFactionStore } from '../../../../store/factionStore';

/** 내 진영 — 이 기기(factionStore)가 곧 기록이다. 목업 모드와 서버 미배포 폴백이 쓴다. */
export class MockFactionRepository implements IFactionRepository {
  async get(): Promise<FactionId | null> {
    return useFactionStore.getState().faction;
  }

  async set(_id: FactionId): Promise<void> {
    // 이미 기기에 기록돼 있다(선택 화면이 스토어에 먼저 쓴다).
  }
}
