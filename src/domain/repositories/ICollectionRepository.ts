import type { CollectionSnapshot } from '../models/Collection';

/**
 * 안전 카드 도감의 서버 보관 계약.
 *
 * 뽑기 자체는 기기에서 돈다(오프라인이 일상인 앱이라 서버가 뽑아 줄 수 없다).
 * 서버는 결과를 보관·병합한다 — 그래서 메서드가 '가져오기'와 '맞추기' 둘뿐이다.
 */
export interface ICollectionRepository {
  /** 서버에 저장된 내 도감을 가져온다. */
  pull(): Promise<CollectionSnapshot>;
  /**
   * 내 상태를 보내고 **병합된 결과**를 받는다.
   * 응답을 그대로 새 상태로 삼아야 여러 기기가 결국 같은 값에 수렴한다.
   */
  sync(local: CollectionSnapshot): Promise<CollectionSnapshot>;
}
