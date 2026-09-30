import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { useFactionStore } from '../store/factionStore';
import { factionRepository } from '../data/repositories';
import type { FactionId } from '../constants/factions';
import { logger } from '../utils/logger';

/**
 * 내 진영을 서버와 맞춘다(루트 레이아웃 전용).
 *
 *  · 로그인 직후 한 번 서버 기록을 읽는다 — 있으면 **서버가 정본**(다른 기기에서 고른 진영).
 *    없고 이 기기에만 있으면 올린다(서버가 생기기 전에 고른 사람).
 *  · 그 뒤 진영을 바꾸면(진영 선택 화면) 올린다.
 * 서버 라우트가 없으면 저장소 폴백이 이 기기 기록을 돌려주므로 아무 일도 일어나지 않고,
 * 열리는 날 다음 로그인부터 자동으로 맞춰진다.
 */
export function useFactionSync(): void {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  /** 서버에서 받아 스토어에 넣은 값 — 그 변경을 다시 서버로 올리지 않기 위한 표식. */
  const fromServer = useRef<FactionId | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const push = (id: FactionId) => {
      factionRepository.set(id).catch((e) => logger.warn('faction.push_failed', { reason: String(e) }));
    };

    const pull = async () => {
      // 스토어가 디스크에서 돌아오기 전에 비교하면 '이 기기엔 없음'으로 오판한다.
      if (!useFactionStore.persist.hasHydrated()) {
        await new Promise<void>((resolve) => {
          const unsub = useFactionStore.persist.onFinishHydration(() => { unsub(); resolve(); });
        });
      }
      if (cancelled) return;
      try {
        const server = await factionRepository.get();
        if (cancelled) return;
        const local = useFactionStore.getState().faction;
        if (server && server !== local) {
          fromServer.current = server;
          useFactionStore.getState().chooseFaction(server);
        } else if (!server && local) {
          push(local);
        }
      } catch (e) {
        logger.warn('faction.pull_failed', { reason: String(e) });
      }
    };
    void pull();

    const unsub = useFactionStore.subscribe((s, prev) => {
      if (!s.faction || s.faction === prev.faction) return;
      if (fromServer.current === s.faction) { fromServer.current = null; return; }
      push(s.faction);
    });
    return () => { cancelled = true; unsub(); };
  }, [userId]);
}
