import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { reconcileDailyReminder } from '../data/notifications/NotificationService';
import { logger } from '../utils/logger';

/**
 * 기기에 걸린 학습 리마인더를 **지금 로그인한 사람의 설정**에 맞춘다(루트 레이아웃 전용).
 *
 * 알림 수신·시각은 계정 설정이라 서버와 동기화되지만, 기기 예약은 설정 화면에서
 * 스위치를 만질 때만 걸렸다. 그래서 다른 경로로 설정이 바뀌면 기기가 따라가지 않았다
 * (자세한 경우는 reconcileDailyReminder 주석). 값이 바뀔 때마다 한 번씩 맞춘다.
 *
 * 로그아웃 상태에서는 걷는다 — 공용 태블릿에서 앞사람의 리마인더가 뒷사람에게
 * 울리면 안 되고, 로그인 화면으로 데려가는 '오늘의 학습 카드가 도착했어요'는 거짓이다.
 */
export function useReminderSchedule(): void {
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const enabled = useSettingsStore((s) => s.notifications.enabled);
  const time = useSettingsStore((s) => s.notifications.dailyReminderTime);

  useEffect(() => {
    if (!bootstrapped) return;
    const target = userId && enabled ? time : null;
    reconcileDailyReminder(target).catch((e) => {
      logger.warn('reminder.reconcile_failed', { reason: String(e) });
    });
  }, [bootstrapped, userId, enabled, time]);
}
