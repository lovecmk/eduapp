import { isInterestField, type InterestField } from '../../constants/interests';
import { DEFAULT_VISIBILITY, type ProfileVisibility } from './PublicProfile';

/**
 * 계정에 종속된 설정 — **기기가 아니라 사람을 따라가는 값**.
 *
 * ── 무엇을 동기화하고 무엇을 남기는가 ────────────────────────────────────
 * 설정은 두 종류가 섞여 있다. 하나는 '이 사람이 어떤 학습자인가'(관심 분야·
 * 하루 목표·알림 수신·공개 범위·한 줄 소개)이고, 다른 하나는 '이 기기에서
 * 어떻게 보이는가'(테마·글자 크기·화면 켜둠·생체인증·햅틱)다.
 *
 * 앞쪽만 서버에 올린다. 기기 취향까지 계정에 묶으면, 사무실 PC 웹에서 다크
 * 테마로 바꾼 것이 현장 태블릿의 밝은 화면까지 어둡게 만든다 — 조도가 다른
 * 환경에서 쓰는 앱에서는 친절이 아니라 방해다. 반대로 관심 분야·알림 동의를
 * 기기에만 두면, 기기를 바꾼 사람이 처음부터 다시 고르고 마케팅 수신 동의
 * 같은 **법적 의미가 있는 선택까지 사라진다.**
 *
 * 기기 전용(동기화 제외): themeMode · fontScale · highContrast · ambientTheme ·
 * keepScreenOn · offlineMode · biometricLoginEnabled · dontKnowHaptic ·
 * profileImage · recentSettingIds · rewardsGuideSeen.
 */

export interface AccountNotificationSettings {
  enabled: boolean;
  /** 'HH:MM' 24시간 표기 */
  dailyReminderTime: string;
  reviewAlerts: boolean;
  weeklyReport: boolean;
  inApp: boolean;
  email: boolean;
  /** 마케팅 정보 수신 동의 — 기기가 아니라 사람에게 붙는 선택이다. */
  marketing: boolean;
}

export interface AccountSettings {
  notifications: AccountNotificationSettings;
  dailyTarget: number;
  shuffleCards: boolean;
  prioritizeWeakSpots: boolean;
  interests: InterestField[];
  bio: string;
  flexPromptEnabled: boolean;
  showAchievementBadge: boolean;
  collectionEnabled: boolean;
  profileVisibility: ProfileVisibility;
}

/**
 * 서버·구버전 저장소에서 오는 '일부만 채워진' 설정.
 *
 * 중첩 객체까지 부분 허용해야 한다 — 서버가 알림 설정 중 두 개만 알고 있을 때
 * `Partial<AccountSettings>` 로는 나머지를 `undefined` 로 채운 완전한 객체를
 * 만들 수밖에 없고, 그 순간 기기에 남아 있던 값이 지워진다.
 */
export interface AccountSettingsPatch
  extends Partial<Omit<AccountSettings, 'notifications' | 'profileVisibility' | 'interests'>> {
  notifications?: Partial<AccountNotificationSettings>;
  profileVisibility?: Partial<ProfileVisibility>;
  /** 서버가 모르는 분야 문자열이 섞여 올 수 있으므로 넓게 받고 정규화에서 거른다. */
  interests?: string[];
}

/** 하루 목표 카드 수의 허용 범위 — 밖의 값은 잘라서 받는다(거절하지 않는다). */
export const DAILY_TARGET_MIN = 1;
export const DAILY_TARGET_MAX = 50;

/** 한 줄 소개 최대 길이. */
export const BIO_MAX = 100;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? Math.trunc(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

/**
 * 서버(또는 오래된 로컬 저장분)에서 온 설정을 앱이 믿을 수 있는 형태로 만든다.
 *
 * 범위를 벗어난 값은 **거절이 아니라 절삭**이다 — 하루 목표 하나가 이상하다고
 * 응답 전체를 버리면 관심 분야·알림 동의까지 함께 사라진다(도감 동기화와 같은 원칙).
 */
export function normalizeAccountSettings(
  patch: AccountSettingsPatch | null | undefined,
  base: AccountSettings,
): AccountSettings {
  const p = patch ?? {};
  const n = p.notifications ?? {};
  const v = p.profileVisibility ?? {};
  return {
    notifications: {
      enabled: bool(n.enabled, base.notifications.enabled),
      dailyReminderTime:
        typeof n.dailyReminderTime === 'string' && TIME_RE.test(n.dailyReminderTime)
          ? n.dailyReminderTime
          : base.notifications.dailyReminderTime,
      reviewAlerts: bool(n.reviewAlerts, base.notifications.reviewAlerts),
      weeklyReport: bool(n.weeklyReport, base.notifications.weeklyReport),
      inApp: bool(n.inApp, base.notifications.inApp),
      email: bool(n.email, base.notifications.email),
      marketing: bool(n.marketing, base.notifications.marketing),
    },
    dailyTarget: clampInt(p.dailyTarget, DAILY_TARGET_MIN, DAILY_TARGET_MAX, base.dailyTarget),
    shuffleCards: bool(p.shuffleCards, base.shuffleCards),
    prioritizeWeakSpots: bool(p.prioritizeWeakSpots, base.prioritizeWeakSpots),
    // 모르는 관심 분야 값은 버린다(구버전·오타로 들어온 값이 칩 목록을 깨뜨리지 않게).
    interests: Array.isArray(p.interests) ? p.interests.filter(isInterestField) : base.interests,
    bio: typeof p.bio === 'string' ? p.bio.slice(0, BIO_MAX) : base.bio,
    flexPromptEnabled: bool(p.flexPromptEnabled, base.flexPromptEnabled),
    showAchievementBadge: bool(p.showAchievementBadge, base.showAchievementBadge),
    collectionEnabled: bool(p.collectionEnabled, base.collectionEnabled),
    profileVisibility: {
      searchable: bool(v.searchable, base.profileVisibility.searchable),
      showProgress: bool(v.showProgress, base.profileVisibility.showProgress),
      showStreak: bool(v.showStreak, base.profileVisibility.showStreak),
      showEmblems: bool(v.showEmblems, base.profileVisibility.showEmblems),
      showCollection: bool(v.showCollection, base.profileVisibility.showCollection),
    },
  };
}

/** 계정 설정의 기본값 — 서버에도 기기에도 값이 없을 때의 출발점. */
export const DEFAULT_ACCOUNT_SETTINGS: AccountSettings = {
  notifications: {
    enabled: true,
    dailyReminderTime: '09:00',
    reviewAlerts: true,
    weeklyReport: true,
    inApp: true,
    email: false,
    marketing: false,
  },
  // 하루 학습 상한 = 신규 3장 + 복습 최대 4장 = 7장(운영 지속가능성·하루 3분).
  dailyTarget: 7,
  shuffleCards: true,
  prioritizeWeakSpots: false,
  interests: [],
  bio: '',
  flexPromptEnabled: true,
  showAchievementBadge: true,
  collectionEnabled: false,
  profileVisibility: DEFAULT_VISIBILITY,
};

/** 두 설정이 실질적으로 같은지 — 불필요한 재전송을 막는 지문 비교용. */
export function sameAccountSettings(a: AccountSettings, b: AccountSettings): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** 로그인 직후 서버와 기기 중 어느 쪽을 따를 것인가. */
export type SettingsSyncDecision = 'apply-server' | 'push-local' | 'in-sync';

/**
 * 동기화 판단을 한 함수로 모은다 — 이 규칙이 틀리면 사용자가 방금 끈 알림이
 * 다시 켜지거나(서버가 이기면 안 될 때 이겨서), 기기를 바꿔도 설정이 따라오지
 * 않는다(기기가 이기면 안 될 때 이겨서). 화면·네트워크와 떨어뜨려 두어야
 * 그 규칙만 따로 시험할 수 있다.
 *
 * @param present    서버에 이 계정의 설정 기록이 있는가
 * @param serverAt   서버 updated_at(epoch ms). 모르면 0
 * @param localAt    기기에서 마지막으로 손댄 시각(epoch ms). 한 번도 없으면 0
 * @param identical  서버 값을 기기 값에 얹어도 달라지는 게 없는가
 */
export function decideSettingsSync(input: {
  present: boolean;
  serverAt: number;
  localAt: number;
  identical: boolean;
}): SettingsSyncDecision {
  // 서버가 이 계정을 모른다(신규 계정·라우트 미배포) → 기기 값이 유일한 원본이다.
  if (!input.present) return 'push-local';
  // 내용이 같으면 누가 최신인지 따질 일이 없다. 시각만 다른 값을 주고받으면
  // 앱을 켤 때마다 쓰기가 한 번씩 나간다.
  if (input.identical) return 'in-sync';
  // 기기에서 한 번도 바꾼 적이 없으면 비교할 근거가 없다 — 서버를 따른다.
  if (input.localAt === 0 || input.serverAt > input.localAt) return 'apply-server';
  return 'push-local';
}
