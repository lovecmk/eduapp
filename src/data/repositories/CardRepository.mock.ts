import type { ICardRepository } from '../../domain/repositories/ICardRepository';
import type { LearningCard, CardStatus } from '../../domain/models/LearningCard';
import type { CardDraft } from '../../domain/models/CardDraft';
import { draftToSeedCard } from '../../domain/models/CardDraft';
import { useAuthoredCardsStore } from '../../store/authoredCardsStore';
import { useCardProgressStore } from '../../store/cardProgressStore';
import { CARD_SEED } from '../cards.seed';
import { delay } from './_delay';


const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d;
};

// 시드(엑셀 원본) 카드를 런타임 학습카드로 구성한다.
// ⚠️ 상태는 절대 임의로 지어내지 않는다 — 모든 카드는 기본이 'new'(학습전)이고,
//    실제 학습으로 바뀐 상태만 cardProgressStore 에서 덮어쓴다. 그래야 '학습전/학습중/학습완료'가
//    엄격히 실제 학습을 반영하고, 데이터 초기화 후에도 완료 상태가 남지 않는다.
function seedToLearningCard(seed: (typeof CARD_SEED)[number]): LearningCard {
  return { ...seed, status: 'new', dueAt: day(0) };
}

// 시드 원본(모두 학습전). 카드 자체 정보는 불변이므로 한 번만 만든다.
const baseCards: LearningCard[] = CARD_SEED.map(seedToLearningCard);

/** 저장된 실제 학습 상태를 입혀 반환한다(없으면 'new'). */
function withProgress(card: LearningCard): LearningCard {
  const status = useCardProgressStore.getState().getStatus(card.id);
  return status === card.status ? card : { ...card, status };
}

/** 등록 보관소의 시드카드를 런타임 학습카드로 변환(진행 상태 반영). */
function authoredLearningCards(): LearningCard[] {
  return useAuthoredCardsStore.getState().cards.map((seed) =>
    withProgress({ ...seed, status: 'new', dueAt: day(0) }),
  );
}

export class MockCardRepository implements ICardRepository {

  async getAllCards(): Promise<LearningCard[]> {
    await delay(300);
    return [...baseCards.map(withProgress), ...authoredLearningCards()];
  }

  async markCard(id: string, status: CardStatus): Promise<LearningCard> {
    await delay(200);
    // 실제 학습 상태 변화는 cardProgressStore(영속) 한 곳에만 기록한다.
    useCardProgressStore.getState().setStatus(id, status);
    const base = baseCards.find((c) => c.id === id);
    if (base) return { ...base, status };
    const seed = useAuthoredCardsStore.getState().cards.find((c) => c.id === id);
    if (!seed) throw new Error('목업 데이터에 없는 id입니다');
    return { ...seed, status, dueAt: day(0) };
  }

  async createCards(drafts: CardDraft[]): Promise<LearningCard[]> {
    await delay(250);
    const seeds = drafts.map((d) => draftToSeedCard(d));
    useAuthoredCardsStore.getState().addCards(seeds);
    return seeds.map((seed) => ({ ...seed, status: 'new' as CardStatus, dueAt: day(0) }));
  }
}
