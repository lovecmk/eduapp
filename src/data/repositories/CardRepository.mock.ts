import type { ICardRepository } from '../../domain/repositories/ICardRepository';
import type { LearningCard, CardStatus } from '../../domain/models/LearningCard';
import { CARD_SEED } from '../cards.seed';
import { delay } from './_delay';

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d;
};

// 시드(엑셀 원본) 카드에 학습 진행 상태를 입혀 런타임 카드로 구성한다.
// 결정론적 분포: 앞쪽 일부는 이미 학습/마스터한 것으로, 나머지는 오늘/이후 예정으로 배치해
// 통계·복습·캘린더가 "살아있는" 값을 갖도록 한다.
function seedToLearningCard(seed: (typeof CARD_SEED)[number], i: number): LearningCard {
  // 6장마다 1장은 마스터, 3장마다 1장은 학습 중, 나머지는 새 카드.
  let status: CardStatus = 'new';
  if (i % 6 === 2) status = 'mastered';
  else if (i % 3 === 0) status = 'learning';

  // 예정일: 학습/마스터한 카드는 과거~오늘, 새 카드는 오늘부터 순차 배분.
  const dueAt =
    status === 'mastered' ? day(-((i % 5) + 1)) : status === 'learning' ? day(0) : day(i % 4);

  return { ...seed, status, dueAt };
}

function createMockCards(): LearningCard[] {
  return CARD_SEED.map(seedToLearningCard);
}

let mockCards = createMockCards();

export class MockCardRepository implements ICardRepository {
  async getTodayCards(): Promise<LearningCard[]> {
    await delay(300);
    return mockCards.filter((c) => c.dueAt && c.dueAt <= day(0) && c.status !== 'mastered');
  }

  async getAllCards(): Promise<LearningCard[]> {
    await delay(300);
    return [...mockCards];
  }

  async markCard(id: string, status: CardStatus): Promise<LearningCard> {
    await delay(200);
    const idx = mockCards.findIndex((c) => c.id === id);
    if (idx < 0) throw new Error('목업 데이터에 없는 id입니다');
    const updated = { ...mockCards[idx], status };
    mockCards = [...mockCards];
    mockCards[idx] = updated;
    return updated;
  }
}
