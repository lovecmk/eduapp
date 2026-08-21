import type { LearningCard, CardStatus } from '../models/LearningCard';
import type { CardDraft } from '../models/CardDraft';

/**
 * 카드 콘텐츠 저장소.
 *
 * '오늘의 학습'은 여기 없다 — 무엇을 낼지는 사람마다 다른 편성이라
 * `IDailyAssignmentRepository` 가 맡는다. 예전에는 이 계약에도
 * `getTodayCards` 가 있어 선택 엔진이 두 벌이었고, 앱은 둘 다 쓰지 않고
 * 화면에서 또 골랐다.
 */
export interface ICardRepository {
  getAllCards(): Promise<LearningCard[]>;
  markCard(id: string, status: CardStatus): Promise<LearningCard>;
  /** 문제(카드) 등록 — 초안 배열을 저장(서버 전환 시 POST /inner/api/v1/cards). 등록된 카드를 반환. */
  createCards(drafts: CardDraft[]): Promise<LearningCard[]>;
}
