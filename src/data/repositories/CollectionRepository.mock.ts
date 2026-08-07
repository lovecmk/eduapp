import type { ICollectionRepository } from '../../domain/repositories/ICollectionRepository';
import { EMPTY_SNAPSHOT, mergeSnapshots, type CollectionSnapshot } from '../../domain/models/Collection';
import { delay } from './_delay';

/**
 * 목업 도감 저장소 — 메모리에 '서버 한 대'를 흉내 낸다.
 *
 * 서버와 같은 병합 규칙(mergeSnapshots)을 쓴다. 목업이 다른 규칙으로 답하면
 * 목업으로 개발한 화면이 실서버에서 다르게 동작한다.
 */
export class MockCollectionRepository implements ICollectionRepository {
  private stored: CollectionSnapshot = { ...EMPTY_SNAPSHOT };

  async pull(): Promise<CollectionSnapshot> {
    await delay(150);
    return this.stored;
  }

  async sync(local: CollectionSnapshot): Promise<CollectionSnapshot> {
    await delay(150);
    this.stored = mergeSnapshots(this.stored, local);
    return this.stored;
  }
}
