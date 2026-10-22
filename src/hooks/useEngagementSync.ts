import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useLikeStore } from '../store/likeStore';
import { useBookmarkStore } from '../store/bookmarkStore';
import { useAuthStore } from '../store/authStore';
import { engagementRepository } from '../data/repositories';
import { logger } from '../utils/logger';
import { getSessionEpoch } from '../data/network/sessionEpoch';
import { apiClient } from '../data/network/ApiClient';
import { waitForHydration } from '../data/storage/hydration';
import { restoring, restored, useAccountRestoreStore } from '../store/accountRestoreStore';

interface LocalChoice { on: boolean; confirmed: boolean }

/**
 * 카드 반응(추천·저장)을 서버와 맞춘다.
 *
 * `EngagementRepository` 와 서버의 `/inner/api/v1/engagement/*` 는 완성돼 있었지만
 * **아무도 부르지 않았다**(useProgressSync 머리말 참고 — 같은 종류의 누락이다).
 * 그래서 운영 DB 의 `engagement` 는 0행이었고, 사용자가 저장해 둔 카드는
 * 기기를 바꾸는 순간 사라졌다.
 *
 * ── 왜 '원하는 상태'를 보내는가 ────────────────────────────────────────
 * 스토어는 toggle 이지만 서버로는 결과 상태(liked=true/false)를 보낸다.
 * 오프라인 큐가 재전송하는 이 앱에서 토글을 두 번 보내면 원래대로 돌아간다.
 */
export function useEngagementSync(): void {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const enabled = !!userId;
  const retry = useAccountRestoreStore(s => s.retry);
  const epoch = getSessionEpoch();

  // 서버가 이미 아는 상태. 여기 있는 것과 같으면 보내지 않는다.
  const knownLiked = useRef<Set<string>>(new Set());
  const knownMarked = useRef<Set<string>>(new Set());
  const initialized = useRef(false);
  const applyingServer = useRef(false);
  const syncScope = useRef('');
  const changes = useRef({ like: new Map<string, LocalChoice>(), bookmark: new Map<string, LocalChoice>() });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false, running = false;
    const scope = `${epoch}:${userId}`;
    if (syncScope.current !== scope) {
      syncScope.current = scope;
      initialized.current = false;
      knownLiked.current = new Set(); knownMarked.current = new Set();
      changes.current = { like: new Map(), bookmark: new Map() };
    }
    const pull = async () => {
      if (cancelled || running || epoch !== getSessionEpoch()) return;
      running = true;
      restoring('engagement', userId, epoch);
      try {
        await waitForHydration(useLikeStore, useBookmarkStore);
        if (cancelled || epoch !== getSessionEpoch()) return;
        await apiClient.flushPendingWrites();
        if (cancelled || epoch !== getSessionEpoch()) return;
        // Choices already saved before this lookup must not override newer changes
        // from another device. Keep unconfirmed writes and choices made during GET.
        for (const pending of [changes.current.like, changes.current.bookmark]) {
          for (const [id, choice] of pending) if (choice.confirmed) pending.delete(id);
        }
        const snap = await engagementRepository.pull();
        if (cancelled || epoch !== getSessionEpoch()) return;

        // 최초 조회는 기존 기기 반응을 이관한다. 이후 조회는 다른 기기의 해제도
        // 반영하되, 조회 중 사용자가 누른 최신 선택이 늦은 응답보다 우선한다.
        const merge = (remote: string[], local: string[], kind: 'like' | 'bookmark') => {
          const ids = new Set(initialized.current ? remote : [...remote, ...local]);
          for (const [id, choice] of changes.current[kind]) {
            if (choice.on) ids.add(id);
            else ids.delete(id);
          }
          return [...ids];
        };
        const liked = merge(snap.likedIds, useLikeStore.getState().ids, 'like');
        const marked = merge(snap.bookmarkedIds, useBookmarkStore.getState().ids, 'bookmark');
        knownLiked.current = new Set(snap.likedIds);
        knownMarked.current = new Set(snap.bookmarkedIds);
        applyingServer.current = true;
        try {
          useLikeStore.setState({ ids: liked });
          useBookmarkStore.setState({ ids: marked });
        } finally { applyingServer.current = false; }
        changes.current.like.clear(); changes.current.bookmark.clear();
        initialized.current = true;
        restored('engagement', userId, epoch, 'ready');

        // 실제 차이만 보낸다. 조회 도중 해제한 반응은 false로도 전송한다.
        for (const id of liked) {
          if (!knownLiked.current.has(id)) void push('like', id, true);
        }
        for (const id of snap.likedIds) {
          if (!liked.includes(id)) void push('like', id, false);
        }
        for (const id of marked) {
          if (!knownMarked.current.has(id)) void push('bookmark', id, true);
        }
        for (const id of snap.bookmarkedIds) {
          if (!marked.includes(id)) void push('bookmark', id, false);
        }
      } catch (e) {
        if (!cancelled) restored('engagement', userId, epoch, 'error');
        logger.warn('engagement.pull_failed', { reason: String(e) });
      } finally { running = false; }
    };
    void pull();
    const appSub = AppState.addEventListener('change', state => { if (state === 'active') void pull(); });
    return () => {
      cancelled = true;
      appSub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, userId, retry]);

  async function push(kind: 'like' | 'bookmark', cardId: string, on: boolean): Promise<void> {
    if (epoch !== getSessionEpoch()) return;
    const choice = { on, confirmed: false };
    changes.current[kind].set(cardId, choice);
    const known = kind === 'like' ? knownLiked.current : knownMarked.current;
    if (on) known.add(cardId);
    else known.delete(cardId);
    try {
      if (kind === 'like') await engagementRepository.setLiked(cardId, on);
      else await engagementRepository.setBookmarked(cardId, on);
      if (epoch === getSessionEpoch() && changes.current[kind].get(cardId) === choice) choice.confirmed = true;
    } catch (e) {
      if (epoch !== getSessionEpoch()) return;
      // 되돌려 둔다 — 다음 변경 때 다시 시도된다.
      if (on) known.delete(cardId);
      else known.add(cardId);
      logger.warn(`engagement.${kind}_failed`, { cardId, reason: String(e) });
    }
  }

  useEffect(() => {
    if (!enabled) return;
    let prevLiked = useLikeStore.getState().ids;
    let prevMarked = useBookmarkStore.getState().ids;

    const diff = (before: string[], after: string[], kind: 'like' | 'bookmark') => {
      if (applyingServer.current || epoch !== getSessionEpoch()) return;
      const store = kind === 'like' ? useLikeStore : useBookmarkStore;
      if (!store.persist.hasHydrated()) return;
      const b = new Set(before);
      const a = new Set(after);
      for (const id of a) if (!b.has(id)) {
        changes.current[kind].set(id, { on: true, confirmed: false });
        if (initialized.current) void push(kind, id, true);
      }
      for (const id of b) if (!a.has(id)) {
        changes.current[kind].set(id, { on: false, confirmed: false });
        if (initialized.current) void push(kind, id, false);
      }
    };

    const unsubLike = useLikeStore.subscribe((s) => {
      if (s.ids === prevLiked) return;
      diff(prevLiked, s.ids, 'like');
      prevLiked = s.ids;
    });
    const unsubMark = useBookmarkStore.subscribe((s) => {
      if (s.ids === prevMarked) return;
      diff(prevMarked, s.ids, 'bookmark');
      prevMarked = s.ids;
    });

    return () => {
      unsubLike();
      unsubMark();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, userId]);
}
