import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useNotificationStore } from '../store/notificationStore';
import { useAuthStore } from '../store/authStore';
import { notificationRepository } from '../data/repositories';
import { logger } from '../utils/logger';

/**
 * 서버 알림(관리 콘솔이 보낸 공지)을 받아오고 읽음 상태를 되돌려준다.
 *
 * `NotificationRepository` 와 서버의 `/inner/api/v1/notifications*` 는 완성돼
 * 있었지만 **아무도 부르지 않았다.** 그래서 관리자가 콘솔에서 공지를 보내도
 * 앱에는 한 건도 닿지 않았고, 알림함에는 코드에 박힌 시드 4건이 늘 떠 있었다.
 * (운영 DB 의 `notifications` 는 0행이었다.)
 *
 * ── 읽음은 서버가 기록한다 ─────────────────────────────────────────────
 * 로컬에만 두면 기기마다 읽음 상태가 갈린다. 사용자는 사무실에서 읽은 공지를
 * 현장 태블릿에서 다시 읽지 않아야 한다.
 */

/** 화면에 들어와 있는 동안 이 간격으로 다시 확인한다. */
const POLL_MS = 60_000;

export function useNotificationSync(): void {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const enabled = !!userId;

  /**
   * 이미 서버에 보낸 '읽음' — 같은 알림을 두 번 보내지 않기 위한 표식.
   *
   * 사람이 바뀌면 비운다. 현장 태블릿은 여러 명이 돌려 쓰는데, 이 표식을 물려받으면
   * 앞사람이 읽은 것과 id 가 겹치는 알림의 읽음이 뒷사람에게서는 서버로 나가지
   * 않는다(아래 구독이 userId 로 다시 걸리는 이유).
   */
  const readSent = useRef<Set<string>>(new Set());

  // 1) 목록 가져오기(진입 시 + 주기적으로).
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const pull = async () => {
      try {
        const items = await notificationRepository.list();
        if (!cancelled) useNotificationStore.getState().applyServer(items);
      } catch (e) {
        // 못 가져와도 화면은 그대로 둔다 — 지금 보고 있는 목록을 지우면
        // 연결이 끊긴 순간 알림함이 텅 빈 것처럼 보인다.
        logger.warn('notification.list_failed', { reason: String(e) });
      }
    };

    void pull();

    // 앱을 내려놓은 동안에는 묻지 않는다.
    //
    // 이건 react-query 가 아니라 맨 setInterval 이라, 생명주기 다리
    // (data/network/queryLifecycle)의 focusManager 가 멈춰 주지 못한다. 그대로
    // 두면 주머니 속 앱이 1분마다 알림 목록을 받아 온다 — 현장에서 하루를 나야
    // 하는 기기의 배터리와 데이터를 조용히 태우는 종류의 낭비다. 대신 다시
    // 앞으로 나오는 순간 곧바로 한 번 확인한다(최대 1분을 기다리지 않는다).
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void pull();
    }, POLL_MS);

    const onAppState = (status: AppStateStatus) => {
      if (status === 'active') void pull();
    };
    const appSub = AppState.addEventListener('change', onAppState);

    return () => {
      cancelled = true;
      clearInterval(timer);
      appSub.remove();
    };
  }, [enabled, userId]);

  // 2) 읽음 되돌려주기.
  useEffect(() => {
    if (!enabled) return;
    readSent.current = new Set();
    let prev = useNotificationStore.getState().items;

    const unsub = useNotificationStore.subscribe((s) => {
      if (s.items === prev) return;
      const before = new Map(prev.map((n) => [n.id, n.read]));

      // 전부 읽음을 한 건씩 보내면 요청이 목록 길이만큼 나간다.
      const newlyRead = s.items.filter((n) => n.read && before.get(n.id) === false);
      const allRead = s.items.length > 0 && s.items.every((n) => n.read);

      if (allRead && newlyRead.length > 1) {
        for (const n of newlyRead) readSent.current.add(n.id);
        void notificationRepository.markAllRead().catch((e) => {
          for (const n of newlyRead) readSent.current.delete(n.id);
          logger.warn('notification.mark_all_failed', { reason: String(e) });
        });
      } else {
        for (const n of newlyRead) {
          if (readSent.current.has(n.id)) continue;
          readSent.current.add(n.id);
          void notificationRepository.markRead(n.id).catch((e) => {
            readSent.current.delete(n.id);
            logger.warn('notification.mark_read_failed', { id: n.id, reason: String(e) });
          });
        }
      }
      prev = s.items;
    });

    return unsub;
  }, [enabled, userId]);
}
