import { useEffect, useRef } from 'react';
import { useCollectionStore } from '../store/collectionStore';
import { collectionRepository } from '../data/repositories';
import { useAuthStore } from '../store/authStore';
import { logger } from '../utils/logger';

/**
 * 도감을 서버와 맞춘다.
 *
 * ── 왜 이런 모양인가 ────────────────────────────────────────────────────
 * 도감은 몇 달치 학습의 결과물인데 지금까지 기기 로컬에만 있었다 — 앱을
 * 지우거나 기기를 바꾸면 통째로 사라졌다. 사용자 입장에서 가장 아까운
 * 데이터라, 다른 무엇보다 먼저 서버에 남아야 한다.
 *
 * 그렇다고 팩을 열 때마다 요청을 보내지는 않는다. 이 앱은 지하·철골 구조물
 * 안에서 쓰이고 사용자는 팩을 연달아 여러 개 연다. 그래서:
 *   · 화면에 들어올 때 한 번 맞추고,
 *   · 그 뒤에는 값이 바뀐 뒤 잠깐 잠잠해지면(디바운스) 보낸다.
 *
 * 실패해도 화면은 아무 일 없이 돈다. 저장소가 오프라인 큐를 쓰므로 연결이
 * 돌아오면 알아서 나가고, 병합이 단조 증가라 늦게 도착해도 손실이 없다.
 */

/** 값이 바뀐 뒤 이만큼 잠잠하면 서버로 보낸다. */
const PUSH_DEBOUNCE_MS = 4000;

export function useCollectionSync(): void {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  // 로그인하지 않았으면 보낼 곳이 없다(내 도감이라는 개념 자체가 없다).
  const enabled = !!userId;

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const lastSent = useRef<string>('');

  // 1) 처음 붙을 때(그리고 계정이 바뀔 때) 서버 상태를 가져와 합친다.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const remote = await collectionRepository.pull();
        if (!cancelled) useCollectionStore.getState().applyServer(remote);
      } catch (e) {
        // 못 가져와도 로컬 도감으로 계속 쓴다 — 여기서 막으면 오프라인에서
        // 도감이 아예 안 열린다.
        logger.warn('collection.pull_failed', { reason: String(e) });
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, userId]);

  // 2) 값이 바뀌면 잠깐 기다렸다가 보낸다.
  useEffect(() => {
    if (!enabled) return;

    const push = async () => {
      if (inFlight.current) return;
      const snap = useCollectionStore.getState().snapshot();
      // 같은 내용을 반복해서 보내지 않는다(화면 재진입마다 요청이 나가면
      // 오프라인 큐가 의미 없는 항목으로 찬다).
      const fingerprint = JSON.stringify(snap);
      if (fingerprint === lastSent.current) return;

      inFlight.current = true;
      try {
        const merged = await collectionRepository.sync(snap);
        lastSent.current = fingerprint;
        useCollectionStore.getState().applyServer(merged);
      } catch (e) {
        logger.warn('collection.sync_failed', { reason: String(e) });
      } finally {
        inFlight.current = false;
      }
    };

    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { void push(); }, PUSH_DEBOUNCE_MS);
    };

    // 구독은 스토어 전체에 건다 — 어느 필드가 바뀌든 결국 같은 스냅샷을 보낸다.
    const unsub = useCollectionStore.subscribe(schedule);
    // 화면에 들어온 직후에도 한 번 예약한다(오프라인에서 쌓인 변화를 흘려보낸다).
    schedule();

    return () => {
      unsub();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [enabled]);
}
