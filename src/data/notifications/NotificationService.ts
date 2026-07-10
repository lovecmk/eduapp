// 알림 (로컬 푸시 스케줄링) — PART 3.4
// 웹에서는 expo-notifications 스케줄링이 동작하지 않으므로 Platform 가드로 감싼다.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const isNative = Platform.OS !== 'web';

if (isNative) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
    }),
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNative) {
    // 웹: 브라우저 Notification API 폴백
    try {
      if (typeof Notification === 'undefined') return false;
      const res = await Notification.requestPermission();
      return res === 'granted';
    } catch {
      return false;
    }
  }
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleDailyReminder(time: string): Promise<void> {
  if (!isNative) return; // 웹은 로컬 반복 스케줄 미지원 — no-op
  await Notifications.cancelAllScheduledNotificationsAsync(); // 중복 스케줄 방지
  const [hour, minute] = time.split(':').map(Number);
  await Notifications.scheduleNotificationAsync({
    content: { title: '오늘의 학습 카드가 도착했어요', body: '3분이면 충분해요. 오늘도 안전하게!' },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

export async function cancelAllReminders(): Promise<void> {
  if (!isNative) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}
