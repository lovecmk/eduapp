// 알림 (로컬 푸시 스케줄링) — PART 3.4
// 웹에서는 expo-notifications 스케줄링이 동작하지 않으므로 Platform 가드로 감싼다.
import { Platform, Vibration } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';

const isNative = Platform.OS !== 'web';

// 안드로이드 알림 채널 — 진동/중요도를 이 채널에 고정해 알림 도착 시 확실히 진동한다.
const CHANNEL_ID = 'study-reminders';
const VIBRATION_PATTERN = [0, 250, 150, 250];

if (isNative) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      // 앱이 켜져 있을 때에도 소리/진동으로 도착을 알린다.
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

/** 안드로이드에서 진동이 포함된 알림 채널을 보장한다(최초 1회 생성). */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: '학습 알림',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: VIBRATION_PATTERN,
    enableVibrate: true,
    sound: 'default',
  });
}

/** 즉시 진동 피드백 — 알림을 보냈다는 것을 손끝으로 바로 알 수 있게 한다. */
function buzz(): void {
  if (!isNative) return;
  try {
    Vibration.vibrate(VIBRATION_PATTERN);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // 일부 기기/에뮬레이터는 진동 미지원 — 무시.
  }
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

// 3시간마다 돌아가며 보낼 실제 사용자용 학습 리마인더 문구(테스트용이지만 실사용 가치가 있는 내용).
const STUDY_REMINDERS: { title: string; body: string }[] = [
  { title: '지금 복습하기 딱 좋은 시간이에요 ⏰', body: '망각곡선 기준 복습 시점이 도래한 카드가 있어요. 3분이면 충분해요.' },
  { title: '오늘의 안전 학습, 아직이라면 지금! 👷', body: '신규 3장 + 복습으로 하루 3분. 짧게라도 쌓으면 습관이 됩니다.' },
  { title: '취약 주제를 다시 볼 시간이에요 🔁', body: '자주 틀린 카드는 3학습일 뒤 다시 배치돼요. 잠깐 복습하고 넘어가요.' },
  { title: '현장 위험, 아는 만큼 안전합니다 🦺', body: '전기·공정·위험물 카드 한 장이 오늘의 사고를 막을 수 있어요.' },
];

/**
 * 학습 리마인더 스케줄 — 알림 On 시 호출.
 * ① 매일 지정 시각 리마인더 + ② 3시간마다 반복 리마인더(문구 순환)를 함께 등록한다.
 */
export async function scheduleDailyReminder(time: string): Promise<void> {
  if (!isNative) return; // 웹은 로컬 반복 스케줄 미지원 — no-op
  await ensureAndroidChannel();
  await Notifications.cancelAllScheduledNotificationsAsync(); // 중복 스케줄 방지
  const [hour, minute] = time.split(':').map(Number);

  // ① 매일 지정 시각 리마인더
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '오늘의 학습 카드가 도착했어요',
      body: '3분이면 충분해요. 오늘도 안전하게!',
      sound: 'default',
      ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID, vibrationPattern: VIBRATION_PATTERN } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
    },
  });

  // ② 3시간마다 반복 리마인더 — 문구는 등록 시점 기준으로 순환 선택.
  const idx = Math.floor(Date.now() / (3 * 3600_000)) % STUDY_REMINDERS.length;
  const pick = STUDY_REMINDERS[idx];
  await Notifications.scheduleNotificationAsync({
    content: {
      title: pick.title,
      body: pick.body,
      sound: 'default',
      ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID, vibrationPattern: VIBRATION_PATTERN } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 3 * 60 * 60, // 3시간
      repeats: true,
      ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
    },
  });
}

export async function cancelAllReminders(): Promise<void> {
  if (!isNative) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * 개발자 모드 테스트용 — 실제 기기(안드로이드/iOS)로 즉시 로컬 알림을 보내고 진동을 울린다.
 * 권한이 없으면 요청하고, 거부되면 false 를 반환한다.
 */
export async function sendTestNotification(): Promise<boolean> {
  // 학습과 연관된 실제 리마인더 문구로 테스트한다.
  const title = '오늘의 복습 카드가 기다려요 📚';
  const body = '지금 3분이면 오늘 배운 현장 안전 지식을 오래 기억할 수 있어요.';

  if (!isNative) {
    // 웹: 브라우저 Notification API 폴백
    try {
      if (typeof Notification === 'undefined') return false;
      let perm = Notification.permission;
      if (perm !== 'granted') perm = await Notification.requestPermission();
      if (perm !== 'granted') return false;
      new Notification(title, { body });
      return true;
    } catch {
      return false;
    }
  }

  const granted = await requestNotificationPermission();
  if (!granted) return false;
  await ensureAndroidChannel();
  buzz(); // 버튼을 누른 즉시 손끝으로 확인되도록 진동.
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: 'default',
      ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID, vibrationPattern: VIBRATION_PATTERN } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 1,
      ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
    },
  });
  return true;
}
