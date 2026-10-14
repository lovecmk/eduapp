import { useCollectionStore } from '../../../store/collectionStore';
import { selectPacks, selectShards } from '../../../store/collectionStore';

describe('server-confirmed rooftop rewards only', () => {
  it('cannot grant packs or shards from a local simulated crate', () => {
    const before = useCollectionStore.getState();
    const packs = selectPacks(before), shards = selectShards(before);
    expect(before.openBuildingCrate('2026-10', 10, 100, () => 1)).toBeNull();
    expect(selectPacks(useCollectionStore.getState())).toBe(packs);
    expect(selectShards(useCollectionStore.getState())).toBe(shards);
  });
});
