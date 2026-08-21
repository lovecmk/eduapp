// 알림 (로컬 푸시 스케줄링) — PART 3.4
// 웹에서는 expo-notifications 스케줄링이 동작하지 않으므로 Platform 가드로 감싼다.
import { Platform, Vibration } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { env } from '../network/env';
import { apiClient } from '../network/ApiClient';
import { hapticSuccess } from '../../utils/haptics';

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
  } catch {
    // 일부 기기/에뮬레이터는 진동 미지원 — 무시.
  }
  hapticSuccess();
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

// ─────────────────────────────────────────────────────────────────────────────
// 원격 푸시(Expo Push Token) — "실제 모바일 알림" 강화.
// 로컬 스케줄 알림과 별개로, 서버·텔레그램 명령이 이 기기로 직접 알림을 보낼 수
// 있도록 Expo 푸시 토큰을 발급받아 백엔드(/inner/api/v1/push/register)에 등록한다.
// ─────────────────────────────────────────────────────────────────────────────

/** EAS projectId 를 안전하게 조회한다(원격 푸시 토큰 발급에 필요). */
function resolveProjectId(): string | undefined {
  const fromExtra = (Constants?.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  // 빌드 형태에 따라 easConfig 로 노출되는 경우도 있어 함께 확인한다.
  const fromEas = (Constants as unknown as { easConfig?: { projectId?: string } })?.easConfig?.projectId;
  return fromExtra || fromEas || undefined;
}

/**
 * 이 기기의 Expo 푸시 토큰을 발급받는다.
 * 웹/권한없음/에뮬레이터 등에서는 null 을 반환하며 앱을 죽이지 않는다.
 */
export async function getExpoPushToken(): Promise<string | null> {
  if (!isNative) return null;
  try {
    const granted = await requestNotificationPermission();
    if (!granted) return null;
    await ensureAndroidChannel();
    const projectId = resolveProjectId();
    const res = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return res.data ?? null;
  } catch {
    // 개발 클라이언트/에뮬레이터에서 토큰 발급 실패는 흔하므로 조용히 무시.
    return null;
  }
}

/**
 * 기기 푸시 토큰을 백엔드에 등록(업서트)한다.
 * 목업 모드·웹·API 주소 미설정 시에는 조용히 건너뛴다(no-op).
 * @returns 서버 등록 성공 여부
 */
export async function syncPushTokenWithServer(): Promise<boolean> {
  if (!isNative || env.useMockData || !env.apiBaseUrl) return false;
  const token = await getExpoPushToken();
  if (!token) return false;
  try {
    await apiClient.post('/inner/api/v1/push/register', { token, platform: Platform.OS });
    return true;
  } catch {
    // 미로그인/네트워크 오류 등은 조용히 무시 — 다음 진입 시 재시도된다.
    return false;
  }
}

/** 서버발(發) 알림 트리거 결과 — 텔레그램 /alert1~3 과 동일한 3가지 버전. */
export interface ServerAlertResult {
  sent: number;
  key: string;
  label: string;
  title: string;
}

/**
 * 3가지 알림 버전(1|2|3) 중 하나를 서버가 등록된 모든 기기로 발송하도록 요청한다.
 * 텔레그램 봇의 /alert1~3 명령과 완전히 동일한 경로(백엔드 PushService.Broadcast)를 탄다.
 * 목업/웹/API 미설정 시에는 null 을 반환한다.
 */
export async function triggerServerAlert(version: 1 | 2 | 3): Promise<ServerAlertResult | null> {
  if (env.useMockData || !env.apiBaseUrl) return null;
  try {
    return await apiClient.post<ServerAlertResult>('/inner/api/v1/telegram/alert', { version: String(version) });
  } catch {
    return null;
  }
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
