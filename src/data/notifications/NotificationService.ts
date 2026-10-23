// 알림 (로컬 푸시 스케줄링) — PART 3.4
// 웹에서는 expo-notifications 스케줄링이 동작하지 않으므로 Platform 가드로 감싼다.
import { Platform, Vibration, NativeModules } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { env } from '../network/env';
import { apiClient } from '../network/ApiClient';
import { ROUTES } from '../../constants/routes';
import { hapticSuccess } from '../../utils/haptics';
import { useReminderStatusStore } from '../../store/reminderStatusStore';
import { secureStorage, StorageKeys } from '../storage/secureStorage';
import { getSessionEpoch } from '../network/sessionEpoch';
import { unregisterPushTokenWithServer } from './pushRegistration';

const isNative = Platform.OS !== 'web';

// 안드로이드 알림 채널 — 진동/중요도를 이 채널에 고정해 알림 도착 시 확실히 진동한다.
const CHANNEL_ID = 'study-reminders';
const VIBRATION_PATTERN = [0, 250, 150, 250];
const REMINDER_ID = 'haru-daily-study-reminder';
let reminderRevision = 0;
let reminderQueue: Promise<void> = Promise.resolve();
let communityPresentationAllowed: (data: Record<string, unknown>) => boolean = () => false;

export function setCommunityNotificationPresentation(check: (data: Record<string, unknown>) => boolean): void {
  communityPresentationAllowed = check;
}

interface AlarmAccess { exact: boolean | null; notificationsEnabled: boolean; channelEnabled: boolean }
export async function reminderAlarmAccess(): Promise<AlarmAccess> {
  if (Platform.OS !== 'android') return { exact: null, notificationsEnabled: true, channelEnabled: true };
  return NativeModules.ReminderAlarm?.getStatus?.() ?? { exact: null, notificationsEnabled: true, channelEnabled: true };
}
export async function openExactReminderSettings(): Promise<void> {
  if (Platform.OS === 'android' && NativeModules.ReminderAlarm) await NativeModules.ReminderAlarm.openExactSettings();
}

if (isNative) {
  Notifications.setNotificationHandler({
    handleNotification: async notification => {
      const data = notification.request.content.data;
      const allowed = data.type !== 'community' || communityPresentationAllowed(data);
      return {
        shouldShowAlert: allowed,
        shouldShowBanner: allowed,
        shouldShowList: allowed,
        shouldPlaySound: allowed,
        shouldSetBadge: allowed,
      };
    },
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
  await Notifications.setNotificationChannelAsync('community', {
    name: '커뮤니티 답글·좋아요',
    importance: Notifications.AndroidImportance.DEFAULT,
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
  await ensureAndroidChannel();
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * 학습 리마인더 — 매일 지정 시각 한 번.
 *
 * 예전에는 여기서 **3시간마다 반복되는 알림**도 함께 걸었다(테스트용으로 넣었던 것이
 * 그대로 남아 있었다). 반복 간격 알림은 시각을 가리지 않아 새벽 3시에도 울리고,
 * 그날 학습을 마친 사람에게도 계속 온다. 설정 화면은 "매일 이 시각에 알려드려요",
 * "꼭 필요한 알림만 보내요"라고 약속하는데 기기는 하루 8번 울렸다. 약속한 대로 한 번만 건다.
 */
export async function scheduleDailyReminder(time: string): Promise<void> {
  await reconcileDailyReminder(time);
}

/**
 * 기기의 예약 알림을 지금 설정에 맞춘다 — 권한을 **묻지 않는다.**
 *
 * 예약은 설정 화면에서 스위치·시각을 바꿀 때만 걸렸다. 그래서 설정이 다른 길로 바뀌면
 * 기기 예약이 따라가지 않았다.
 *  · 다른 기기에서 시각을 바꾸면 계정 설정은 동기화되는데(useSettingsSync) 이 기기는 옛 시각에 울렸다.
 *  · 새 기기·재설치에서는 스위치가 '켜짐'으로 보여도 예약이 하나도 없었다.
 *  · 공용 태블릿에서 로그아웃해도 앞사람의 리마인더가 남아 뒷사람에게 울렸다.
 * `time` 이 null 이면 모두 걷는다. 권한이 없으면 걸지 않는다(물어보는 일은 설정 화면이 한다).
 */
export async function reconcileDailyReminder(time: string | null): Promise<void> {
  if (time !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('알림 시각은 00:00~23:59 형식이어야 합니다');
  useReminderStatusStore.setState({ state: 'checking', time, nextAt: null });
  const revision = ++reminderRevision;
  const task = reminderQueue.catch(() => {}).then(async () => {
    if (revision !== reminderRevision) return;
    if (!isNative) { useReminderStatusStore.setState({ state: 'unsupported', exact: null, time, nextAt: null }); return; }
    const requests = await Notifications.getAllScheduledNotificationsAsync();
    const ours = requests.filter(request => {
      const trigger = request.trigger as { type?: string; seconds?: number } | null;
      return request.identifier === REMINDER_ID || request.content.data?.reminder === 'daily-study' ||
        (/학습|복습/.test(request.content.title ?? '') && (trigger?.type === 'daily' || trigger?.type === 'timeInterval' && trigger.seconds === 10_800));
    });
    const clear = async () => {
      for (const request of ours) {
        if (revision !== reminderRevision) return;
        await Notifications.cancelScheduledNotificationAsync(request.identifier);
      }
    };
    if (revision !== reminderRevision) return;
    if (time === null) {
      await clear();
      if (revision === reminderRevision) useReminderStatusStore.setState({ state: 'disabled', time: null, nextAt: null, exact: null });
      return;
    }
    await ensureAndroidChannel();
    const { status } = await Notifications.getPermissionsAsync();
    const access = await reminderAlarmAccess();
    if (revision !== reminderRevision) return;
    if (status !== 'granted' || !access.notificationsEnabled || !access.channelEnabled) {
      await clear();
      if (revision === reminderRevision) useReminderStatusStore.setState({ state: 'permission-denied', exact: access.exact, time, nextAt: null });
      return;
    }
    const [hour, minute] = time.split(':').map(Number);
    const trigger: Notifications.DailyTriggerInput = { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}) };
    const nextAt = await Notifications.getNextTriggerDateAsync(trigger);
    if (nextAt === null || !Number.isFinite(nextAt)) throw new Error('다음 알림 시각을 계산할 수 없습니다');
    if (revision !== reminderRevision) return;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const current = ours.length === 1 && ours[0]?.identifier === REMINDER_ID ? ours[0] : undefined;
    const nativeTrigger = current?.trigger as { hour?: number; minute?: number } | undefined;
    if (!current || current.content.data?.time !== time || nativeTrigger?.hour != null && nativeTrigger.hour !== hour || nativeTrigger?.minute != null && nativeTrigger.minute !== minute || current.content.data?.timezone !== zone || current.content.data?.exact !== access.exact) {
      await clear();
      if (revision !== reminderRevision) return;
      await Notifications.scheduleNotificationAsync({
        identifier: REMINDER_ID,
        content: { title: '오늘의 학습 시간이에요', body: '하루 3분, 배운 카드를 복습해도 좋아요.', data: { route: ROUTES.cards, reminder: 'daily-study', time, timezone: zone, exact: access.exact }, sound: 'default', ...(Platform.OS === 'android' ? { vibrationPattern: VIBRATION_PATTERN } : {}) },
        trigger,
      });
    }
    if (revision === reminderRevision) useReminderStatusStore.setState({ state: 'scheduled', exact: access.exact, time, nextAt });
  });
  reminderQueue = task.catch(() => {});
  try { await task; } catch (error) {
    if (revision === reminderRevision) useReminderStatusStore.setState({ state: 'failed', time, nextAt: null });
    throw error;
  }
}

export async function cancelAllReminders(): Promise<void> {
  await reconcileDailyReminder(null);
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
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return null;
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
 *
 * ── 왜 오프라인 큐로 보내는가 ──────────────────────────────────────────────
 * 예전에는 평범한 `post` 로 보내고 실패하면 "다음 진입 시 재시도된다"고 적어
 * 두었다. 그런데 이 등록을 부르는 곳은 루트 레이아웃의 효과 하나뿐이고, 그
 * 의존성은 `[bootstrapped, user, notificationsEnabled]` 다 — **연결이 돌아와도
 * 다시 돌지 않는다.** 즉 지하에서 앱을 켠 사람은 그 세션 내내 푸시 대상에서
 * 빠지고, 아무 화면에도 그 사실이 뜨지 않는다. 알림이 안 오는 이유를 사용자도
 * 운영자도 알 방법이 없는 종류의 실패다.
 *
 * 오프라인 큐(`postDurable`)로 보내면 연결이 돌아오거나 앱이 다시 앞으로 나올 때
 * (useAppResume 의 flushPendingWrites) 알아서 나간다. 멱등키가 토큰이라 같은
 * 기기의 중복 등록은 서버에서 한 번으로 접힌다.
 *
 * @returns 서버에 등록됐거나 큐에 안전히 쌓였으면 true
 */
export async function syncPushTokenWithServer(stillAllowed: () => boolean = () => true): Promise<boolean> {
  if (!isNative || false || !env.apiBaseUrl) return false;
  const epoch = getSessionEpoch();
  const token = await getExpoPushToken();
  if (epoch !== getSessionEpoch() || !stillAllowed()) return false;
  if (!token) {
    const permission = await Notifications.getPermissionsAsync().catch(() => null);
    if (epoch !== getSessionEpoch() || !stillAllowed()) return false;
    if (permission && permission.status !== 'granted') await unregisterPushTokenWithServer();
    return false;
  }
  try {
    await apiClient.postDurable(
      '/inner/api/v1/push/register',
      { token, platform: Platform.OS },
      `push:${token}`,
    );
    if (epoch === getSessionEpoch()) await secureStorage.setItem(StorageKeys.pushToken, token);
    return true;
  } catch {
    // 미로그인(401) 등 큐로도 해결되지 않는 실패는 조용히 넘긴다.
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
  if (!env.apiBaseUrl) return null;
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
      data: { route: ROUTES.review },
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
