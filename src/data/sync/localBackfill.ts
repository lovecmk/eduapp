import type { IFeedRepository } from '../../domain/repositories/IFeedRepository';
import type { ITipRepository } from '../../domain/repositories/ITipRepository';
import type { IDifficultyPollRepository } from '../../domain/repositories/IDifficultyPollRepository';
import type { IQnaRepository } from '../../domain/repositories/IQnaRepository';
import type { INotificationRepository } from '../../domain/repositories/INotificationRepository';
import { useShareFeedStore } from '../../store/shareFeedStore';
import { useTipStore } from '../../store/tipStore';
import { useDiffPollStore } from '../../store/diffPollStore';
import { useQnaStore } from '../../store/qnaStore';
import { useNotificationStore } from '../../store/notificationStore';

/**
 * 서버가 없던 동안 **이 기기에만 쌓인 것**을 서버가 열린 뒤 옮긴다.
 *
 * ── 왜 필요한가 ─────────────────────────────────────────────────────────────
 * 커뮤니티 기능은 라우트가 없으면 기기 안에서 돌고(withMockFallback), 열리면 서버를 쓴다.
 * 그런데 열리는 순간 화면은 **서버 목록**을 그리므로, 그 전에 기기에 남긴 것은
 * 조용히 사라진다 — 트로피룸의 내 성취 카드, 내가 올린 질문과 팁이 그렇다.
 * '배포하면 자동으로 붙는다'가 온전하려면 그 전의 기록도 함께 옮겨야 한다.
 *
 * ── 규칙 ──────────────────────────────────────────────────────────────────
 *  · **폴백으로 감싸지 않은 실서버 저장소**만 쓴다. 감싼 것을 쓰면 라우트가 없을 때
 *    다시 로컬로 떨어져 같은 글이 두 벌이 된다. 실패하면 그 기능은 멈추고 다음에 다시 한다.
 *  · 옮긴 것만 로컬에서 지운다(한 건씩). 중간에 끊겨도 남은 것은 다음 번에 이어서 간다.
 *  · 로컬에서 만든 것은 id 접두사로 가린다(mybrag- · mine- · myq-). 서버 글은 건드리지 않는다.
 */

export interface LiveRepos {
  feed: IFeedRepository;
  tips: ITipRepository;
  poll: IDifficultyPollRepository;
  qna: IQnaRepository;
  notifications: INotificationRepository;
}

/** 무엇이 옮겨졌는가 — 화면 캐시를 어디까지 새로 받을지 정한다. */
export interface BackfillResult {
  feed: number;
  tips: string[]; // 팁을 옮긴 카드 id
  votes: number;
  questions: number;
  dismissed: number;
}

async function backfillFeed(live: IFeedRepository): Promise<number> {
  const locals = useShareFeedStore.getState().posts
    .filter((p) => p.mine && p.id.startsWith('mybrag-'))
    .reverse(); // 오래된 것부터 — 서버 목록의 순서가 올린 순서와 같도록
  let moved = 0;
  for (const p of locals) {
    await live.post({ author: p.author, color: p.color, imageUri: p.imageUri, aspect: p.aspect, snapshot: p.snapshot });
    useShareFeedStore.getState().remove(p.id);
    moved++;
  }
  return moved;
}

async function backfillTips(live: ITipRepository): Promise<string[]> {
  const locals = useTipStore.getState().tips.filter((t) => t.mine && t.id.startsWith('mine-')).reverse();
  const cards = new Set<string>();
  for (const t of locals) {
    await live.add(t.cardId, t.body);
    useTipStore.getState().remove(t.id);
    cards.add(t.cardId);
  }
  return [...cards];
}

async function backfillVotes(live: IDifficultyPollRepository): Promise<number> {
  const { myVotes, sent } = useDiffPollStore.getState();
  let moved = 0;
  for (const [cardId, vote] of Object.entries(myVotes)) {
    if (sent[cardId] === vote) continue;
    await live.vote(cardId, vote);
    useDiffPollStore.getState().markSent(cardId, vote);
    moved++;
  }
  return moved;
}

async function backfillQuestions(live: IQnaRepository): Promise<number> {
  const locals = useQnaStore.getState().questions.filter((q) => q.mine && q.id.startsWith('myq-'));
  const oldestFirst = [...locals].sort((a, b) => a.createdAt - b.createdAt);
  let moved = 0;
  for (const q of oldestFirst) {
    const created = await live.ask({ title: q.title, body: q.body, category: q.category });
    // 기기에서 내 질문에 달아 둔 내 답변도 함께 옮긴다(남의 답변은 기기에 있을 수 없다).
    for (const a of q.answers.filter((x) => x.mine)) {
      await live.answer(created.id, a.body);
    }
    useQnaStore.getState().removeQuestion(q.id);
    moved++;
  }
  return moved;
}

/** 지운 알림은 한 실행에 한 번만 통째로 알린다(서버가 멱등으로 받는다). */
let dismissedSentThisRun = false;
async function backfillDismissed(live: INotificationRepository): Promise<number> {
  if (dismissedSentThisRun) return 0;
  const ids = useNotificationStore.getState().dismissedIds;
  if (ids.length > 0) await live.dismiss(ids);
  dismissedSentThisRun = true;
  return ids.length;
}

/** 테스트용 — 실행 단위 표식을 되돌린다. */
export function __resetBackfillForTests(): void {
  dismissedSentThisRun = false;
}

/**
 * 모든 기능을 하나씩 시도한다. 한 기능의 실패(라우트 없음·연결 없음)는 다른 기능을 막지 않는다.
 */
export async function runLocalBackfill(live: LiveRepos): Promise<BackfillResult> {
  const result: BackfillResult = { feed: 0, tips: [], votes: 0, questions: 0, dismissed: 0 };
  const attempt = async <K extends keyof BackfillResult>(key: K, job: () => Promise<BackfillResult[K]>) => {
    try {
      result[key] = await job();
    } catch {
      // 아직 라우트가 없거나 못 닿았다 — 남은 것은 기기에 그대로 두고 다음에 다시 한다.
    }
  };
  await attempt('feed', () => backfillFeed(live.feed));
  await attempt('tips', () => backfillTips(live.tips));
  await attempt('votes', () => backfillVotes(live.poll));
  await attempt('questions', () => backfillQuestions(live.qna));
  await attempt('dismissed', () => backfillDismissed(live.notifications));
  return result;
}
