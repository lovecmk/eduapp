import { useEffect, useRef } from 'react';
import { useLikeStore } from '../store/likeStore';
import { useBookmarkStore } from '../store/bookmarkStore';
import { useAuthStore } from '../store/authStore';
import { engagementRepository } from '../data/repositories';
import { logger } from '../utils/logger';

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

  // 서버가 이미 아는 상태. 여기 있는 것과 같으면 보내지 않는다.
  const knownLiked = useRef<Set<string>>(new Set());
  const knownMarked = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const snap = await engagementRepository.pull();
        if (cancelled) return;

        // 합집합으로 합친다 — 오프라인에서 누른 것이 서버에 아직 없을 수 있고,
        // 서버 값으로 덮어쓰면 그 반응이 사라진다.
        const like = useLikeStore.getState();
        for (const id of snap.likedIds) if (!like.has(id)) like.toggle(id);
        const mark = useBookmarkStore.getState();
        for (const id of snap.bookmarkedIds) if (!mark.has(id)) mark.toggle(id);

        knownLiked.current = new Set(snap.likedIds);
        knownMarked.current = new Set(snap.bookmarkedIds);

        // 서버가 모르는 로컬 반응은 지금 올려 보낸다(그동안 기기에만 있던 것).
        for (const id of useLikeStore.getState().ids) {
          if (!knownLiked.current.has(id)) void push('like', id, true);
        }
        for (const id of useBookmarkStore.getState().ids) {
          if (!knownMarked.current.has(id)) void push('bookmark', id, true);
        }
      } catch (e) {
        logger.warn('engagement.pull_failed', { reason: String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, userId]);

  async function push(kind: 'like' | 'bookmark', cardId: string, on: boolean): Promise<void> {
    const known = kind === 'like' ? knownLiked.current : knownMarked.current;
    if (on) known.add(cardId);
    else known.delete(cardId);
    try {
      if (kind === 'like') await engagementRepository.setLiked(cardId, on);
      else await engagementRepository.setBookmarked(cardId, on);
    } catch (e) {
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
      const b = new Set(before);
      const a = new Set(after);
      for (const id of a) if (!b.has(id)) void push(kind, id, true);
      for (const id of b) if (!a.has(id)) void push(kind, id, false);
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
  }, [enabled]);
}
