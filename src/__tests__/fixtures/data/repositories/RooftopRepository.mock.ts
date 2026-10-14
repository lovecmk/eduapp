import type { IRooftopRepository, RooftopReceipt, RooftopState } from '../../../../domain/models/Rooftop';
import { MockCommunityRepository } from './CommunityRepository.mock';
import { useCollectionStore } from '../../../../store/collectionStore';

/** Explicit demo mode only; production never delegates an award here. */
export class MockRooftopRepository implements IRooftopRepository {
  private scoped() {
    return [] as RooftopReceipt[];
  }
  async get(): Promise<RooftopState> {
    const { current } = (await new MockCommunityRepository().getSnapshot()).building;
    return { month: current.month, floors: current.floors, my_bricks: useCollectionStore.getState().bricksFor(current.month), history: [...this.scoped()] };
  }
  async open(month: string, floor: number): Promise<RooftopReceipt> {
    const existing = this.scoped().find((h) => h.month === month && h.floor === floor);
    if (existing) return existing;
    const state = await this.get();
    const now = new Date();
    const got = useCollectionStore.getState().openBuildingCrate(month, floor, state.floors);
    if (!got) throw new Error('상자 조건을 확인해주세요');
    const result = { month, floor, ...got, opened_at: now.toISOString() };
    return result;
  }
}
