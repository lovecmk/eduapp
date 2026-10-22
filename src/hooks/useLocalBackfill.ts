import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { liveCommunityRepositories } from '../data/repositories';
import { runLocalBackfill } from '../data/sync/localBackfill';
import { FEED_KEY } from './useFeed';
import { tipsKey } from './useCardTips';
import { QNA_KEYS } from './useQna';
import { logger } from '../utils/logger';
import { getSessionEpoch } from '../data/network/sessionEpoch';
import { waitForHydration } from '../data/storage/hydration';
import { useShareFeedStore } from '../store/shareFeedStore';
import { useTipStore } from '../store/tipStore';
import { useDiffPollStore } from '../store/diffPollStore';
import { useQnaStore } from '../store/qnaStore';
import { useNotificationStore } from '../store/notificationStore';

/** 같은 실행에서 너무 자주 두드리지 않는다 — 라우트가 없으면 매번 404 만 받는다. */
const MIN_INTERVAL_MS = 10 * 60_000;

/**
 * 서버가 열리면 이 기기에만 있던 글·팁·투표·질문·알림 삭제를 옮긴다(루트 레이아웃 전용).
 * 로그인할 때와 앱이 다시 앞으로 나올 때 시도한다. 규칙은 data/sync/localBackfill.
 */
export function useLocalBackfill(): void {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id ?? null);

  useEffect(() => {
    const live = liveCommunityRepositories;
    if (!userId || !live) return;
    let lastRun = 0, running = false, cancelled = false;
    const epoch = getSessionEpoch();

    const run = async () => {
      if (cancelled || epoch !== getSessionEpoch() || running || Date.now() - lastRun < MIN_INTERVAL_MS) return;
      running = true;
      lastRun = Date.now();
      try {
        await waitForHydration(useShareFeedStore, useTipStore, useDiffPollStore, useQnaStore, useNotificationStore);
        if (cancelled || epoch !== getSessionEpoch()) return;
        const r = await runLocalBackfill(live);
        if (epoch !== getSessionEpoch()) return;
        if (r.feed) void qc.invalidateQueries({ queryKey: FEED_KEY });
        for (const cardId of r.tips) void qc.invalidateQueries({ queryKey: tipsKey(cardId) });
        if (r.votes) void qc.invalidateQueries({ queryKey: ['difficulty-poll'] });
        if (r.questions) void qc.invalidateQueries({ queryKey: QNA_KEYS.all });
        if (r.feed || r.tips.length || r.votes || r.questions) {
          logger.info('local_backfill.moved', { feed: r.feed, tips: r.tips.length, votes: r.votes, questions: r.questions });
        }
      } catch {
        if (!cancelled && epoch === getSessionEpoch()) logger.warn('local_backfill.restore_failed', {});
      } finally {
        running = false;
      }
    };

    void run();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') void run(); });
    return () => { cancelled = true; sub.remove(); };
  }, [userId, qc]);
}
