import type { ICardRepository, TodaySessionOptions } from '../../domain/repositories/ICardRepository';
import type { LearningCard, CardStatus } from '../../domain/models/LearningCard';
import type { CardDraft } from '../../domain/models/CardDraft';
import { draftToSeedCard } from '../../domain/models/CardDraft';
import { useAuthoredCardsStore } from '../../store/authoredCardsStore';
import { useCardProgressStore } from '../../store/cardProgressStore';
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
  async getTodayCards(opts?: TodaySessionOptions): Promise<LearningCard[]> {
    await delay(300);
    let pool = [...baseCards.map(withProgress), ...authoredLearningCards()].filter((c) => c.status !== 'mastered');
    if (opts?.difficulty) pool = pool.filter((c) => c.difficulty === opts.difficulty);
    return packSession(pool);
  }

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
