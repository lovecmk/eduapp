import type { ICardRepository, TodaySessionOptions } from '../../domain/repositories/ICardRepository';
import type { LearningCard, CardStatus } from '../../domain/models/LearningCard';
import type { CardDraft } from '../../domain/models/CardDraft';
import { draftToSeedCard } from '../../domain/models/CardDraft';
import { useAuthoredCardsStore } from '../../store/authoredCardsStore';
import { CARD_SEED } from '../cards.seed';
import { STUDY_SESSION_SECONDS } from '../../constants/difficulty';
import { delay } from './_delay';

const DIFFICULTY_RANK: Record<string, number> = { easy: 0, medium: 1, hard: 2 };

/**
 * 서버(`GET /api/cards/today`)와 동일한 "3분 세션" 패킹 규칙을 목업에서도 재현한다.
 * 복습(예정 도래) 카드를 오래된 순으로 먼저, 이후 신규 카드를 쉬운 난이도부터 채우되
 * study_seconds 합이 목표(3분)에 도달하면 멈춘다. (최소 1장 보장)
 */
function packSession(cards: LearningCard[]): LearningCard[] {
  const now = day(0);
  const due = cards
    .filter((c) => c.status === 'learning' && c.dueAt && c.dueAt <= now)
    .sort((a, b) => (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0));
  const fresh = cards
    .filter((c) => c.status === 'new' || (c.status === 'learning' && !(c.dueAt && c.dueAt <= now)))
    .sort((a, b) => DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty]);

  const ordered = [...due, ...fresh];
  const session: LearningCard[] = [];
  let acc = 0;
  for (const c of ordered) {
    if (session.length > 0 && acc >= STUDY_SESSION_SECONDS) break;
    session.push(c);
    acc += c.studySeconds || 40;
  }
  return session;
}

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

// 등록(authored) 카드의 진행 상태 — 시드 카드와 별도로 메모리에 보관.
const authoredStatus: Record<string, CardStatus> = {};

/** 등록 보관소의 시드카드를 런타임 학습카드로 변환(진행 상태 반영). */
function authoredLearningCards(): LearningCard[] {
  return useAuthoredCardsStore.getState().cards.map((seed) => ({
    ...seed,
    status: authoredStatus[seed.id] ?? 'new',
    dueAt: day(0),
  }));
}

export class MockCardRepository implements ICardRepository {
  async getTodayCards(opts?: TodaySessionOptions): Promise<LearningCard[]> {
    await delay(300);
    let pool = [...mockCards, ...authoredLearningCards()].filter((c) => c.status !== 'mastered');
    if (opts?.difficulty) pool = pool.filter((c) => c.difficulty === opts.difficulty);
    return packSession(pool);
  }

  async getAllCards(): Promise<LearningCard[]> {
    await delay(300);
    return [...mockCards, ...authoredLearningCards()];
  }

  async markCard(id: string, status: CardStatus): Promise<LearningCard> {
    await delay(200);
    const idx = mockCards.findIndex((c) => c.id === id);
    if (idx >= 0) {
      const updated = { ...mockCards[idx], status };
      mockCards = [...mockCards];
      mockCards[idx] = updated;
      return updated;
    }
    // 등록 카드
    const seed = useAuthoredCardsStore.getState().cards.find((c) => c.id === id);
    if (!seed) throw new Error('목업 데이터에 없는 id입니다');
    authoredStatus[id] = status;
    return { ...seed, status, dueAt: day(0) };
  }

  async createCards(drafts: CardDraft[]): Promise<LearningCard[]> {
    await delay(250);
    const seeds = drafts.map((d) => draftToSeedCard(d));
    useAuthoredCardsStore.getState().addCards(seeds);
    return seeds.map((seed) => ({ ...seed, status: 'new' as CardStatus, dueAt: day(0) }));
  }
}
