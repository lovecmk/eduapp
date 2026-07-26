import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ProfileVisibility } from '../domain/models/PublicProfile';
import { type InterestField, isInterestField } from '../constants/interests';
import { DEFAULT_VISIBILITY } from '../domain/models/PublicProfile';
import type { AmbientThemeSetting } from '../constants/ambient';

export type ThemeMode = 'light' | 'dark' | 'dim' | 'system';
export type FontScale = 'xsmall' | 'small' | 'medium' | 'large' | 'xlarge';

interface SettingsState {
  themeMode: ThemeMode;
  fontScale: FontScale;
  highContrast: boolean;
  notifications: {
    enabled: boolean;
    dailyReminderTime: string;
    reviewAlerts: boolean;
    weeklyReport: boolean;
    /** 인앱 푸시 알림 */
    inApp: boolean;
    /** 이메일 알림 */
    email: boolean;
    /** 마케팅 정보 수신 동의 */
    marketing: boolean;
  };
  biometricLoginEnabled: boolean;
  dailyTarget: number;
  shuffleCards: boolean;
  keepScreenOn: boolean;
  offlineMode: boolean;
  /** 복습 진입 시 약점 카드를 우선 노출 */
  prioritizeWeakSpots: boolean;
  /** 카드 넘김 중 '모를 때(빨간 버튼)'에만 미세한 햅틱(ImpactLight)을 준다. */
  dontKnowHaptic: boolean;
  /** 관심 분야(설비·시설) — 개인화용 */
  interests: InterestField[];
  profileImage: string | null;
  /** 내 프로필 한 줄 소개(bio) */
  bio: string;
  /** 목표 달성 시 '플렉스(자랑) 올리기' 유도 노출 여부 */
  flexPromptEnabled: boolean;
  /** 닉네임 옆 성취 뱃지 표출 여부 */
  showAchievementBadge: boolean;
  /** 카드 수집·카드팩 시스템 노출 여부(회의 확정 전까지 설정으로만 접속) */
  collectionEnabled: boolean;
  /** 보상 안내(엠블럼·도감·트로피 차이) 시트를 한 번이라도 봤는지 — 초보자 자동 안내용. */
  rewardsGuideSeen: boolean;
  /** 내 프로필 공개 범위 — 다른 사용자에게 진행도를 어디까지 보여줄지. */
  profileVisibility: ProfileVisibility;
  /** 배경 앰비언트 테마 — 흰 배경 위에 얹는 분위기 효과(자동/없음/비/눈/별 반짝/바람). */
  ambientTheme: AmbientThemeSetting;
  /** 최근에 연 설정 항목 id(최신 순, 최대 4개) — 설정 검색창의 '최근 본 설정' 바로가기. */
  recentSettingIds: string[];

  setThemeMode: (mode: ThemeMode) => void;
  setFontScale: (scale: FontScale) => void;
  toggleHighContrast: () => void;
  updateNotificationSetting: <K extends keyof SettingsState['notifications']>(
    key: K,
    value: SettingsState['notifications'][K],
  ) => void;
  setBiometricLogin: (enabled: boolean) => void;
  setDailyTarget: (n: number) => void;
  toggleShuffleCards: () => void;
  toggleKeepScreenOn: () => void;
  toggleOfflineMode: () => void;
  togglePrioritizeWeakSpots: () => void;
  toggleDontKnowHaptic: () => void;
  toggleInterest: (field: InterestField) => void;
  setProfileImage: (uri: string | null) => void;
  setBio: (bio: string) => void;
  toggleFlexPrompt: () => void;
  toggleAchievementBadge: () => void;
  toggleCollectionEnabled: () => void;
  /** 보상 안내 시트를 봤다고 표시(다시 자동으로 뜨지 않음). */
  markRewardsGuideSeen: () => void;
  /** 프로필 공개 범위의 특정 항목을 토글. */
  toggleVisibility: (key: keyof ProfileVisibility) => void;
  /** 배경 앰비언트 테마 선택. */
  setAmbientTheme: (theme: AmbientThemeSetting) => void;
  /** 설정 항목을 열었을 때 '최근 본 설정'에 기록. */
  pushRecentSetting: (id: string) => void;
  /** 로컬 저장 데이터를 초기화하고 기본 설정으로 되돌린다(방어적 초기화). */
  resetAll: () => void;
}

const DEFAULT_SETTINGS = {
  themeMode: 'system' as ThemeMode,
  fontScale: 'medium' as FontScale,
  highContrast: false,
  notifications: {
    enabled: true,
    dailyReminderTime: '09:00',
    reviewAlerts: true,
    weeklyReport: true,
    inApp: true,
    email: false,
    marketing: false,
  },
  biometricLoginEnabled: false,
  // 하루 학습 상한 = 신규 3장 + 복습 최대 4장 = 7장(운영 지속가능성·하루 3분).
  dailyTarget: 7,
  shuffleCards: true,
  keepScreenOn: false,
  offlineMode: false,
  prioritizeWeakSpots: false,
  // 기본 켜짐 — '모를 때'만 살짝 진동해 촉감 피드백을 준다. 설정에서 완전히 끌 수 있다.
  dontKnowHaptic: true,
  interests: [] as InterestField[],
  profileImage: null as string | null,
  bio: '',
  // 기본 켜짐 — 목표 달성 순간 자연스럽게 자랑(플렉스)하도록 유도. 설정에서 끌 수 있다.
  flexPromptEnabled: true,
  // 기본 켜짐 — 획득한 최고 성취 뱃지를 닉네임 옆에 표출.
  showAchievementBadge: true,
  // 기본 꺼짐 — 카드 수집·카드팩 시스템은 회의 확정 전까지 설정으로만 접속.
  collectionEnabled: false,
  // 기본 꺼짐 — 컬렉션·성취 화면 첫 진입 시 안내를 한 번 자동으로 띄운다.
  rewardsGuideSeen: false,
  // 프로필 공개 범위 기본값 — 진행도·스트릭·엠블럼 공개, 컬렉션 비공개.
  profileVisibility: DEFAULT_VISIBILITY,
  // 배경 테마 기본값 — 자동(날씨·시간대 연동). 맑은 낮이면 아무 효과 없이 깔끔한 흰 배경,
  // 비/눈/강풍이면 해당 효과, 밤 9시 이후엔 별이 반짝인다(별은 API 없이 기기 시계만으로 동작).
  // 요청: 배경 테마 초기값은 '없음'(깔끔한 흰 배경). 사용자가 '자동'을 켜면
  // 날씨(비/눈/강풍)와 시간(밤 9시 이후 별 반짝)에 따라 효과가 나타난다.
  ambientTheme: 'off' as AmbientThemeSetting,
  // 설정 검색창 위에 뜨는 '최근 본 설정' 바로가기 — 처음엔 비어 있다.
  recentSettingIds: [] as string[],
};

/** '최근 본 설정' 최대 보관 개수 — 한 줄에 담기는 만큼만 남겨 화면을 어지럽히지 않는다. */
const RECENT_SETTINGS_LIMIT = 4;

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,

      setThemeMode: (mode) => set({ themeMode: mode }),
      setFontScale: (scale) => set({ fontScale: scale }),
      toggleHighContrast: () => set((s) => ({ highContrast: !s.highContrast })),
      updateNotificationSetting: (key, value) =>
        set((s) => ({ notifications: { ...s.notifications, [key]: value } })),
      setBiometricLogin: (enabled) => set({ biometricLoginEnabled: enabled }),
      setDailyTarget: (n) => set({ dailyTarget: n }),
      toggleShuffleCards: () => set((s) => ({ shuffleCards: !s.shuffleCards })),
      toggleKeepScreenOn: () => set((s) => ({ keepScreenOn: !s.keepScreenOn })),
      toggleOfflineMode: () => set((s) => ({ offlineMode: !s.offlineMode })),
      togglePrioritizeWeakSpots: () => set((s) => ({ prioritizeWeakSpots: !s.prioritizeWeakSpots })),
      toggleDontKnowHaptic: () => set((s) => ({ dontKnowHaptic: !s.dontKnowHaptic })),
      toggleInterest: (field) => set((s) => ({
        interests: s.interests.includes(field) ? s.interests.filter((x) => x !== field) : [...s.interests, field],
      })),
      setProfileImage: (uri) => set({ profileImage: uri }),
      setBio: (bio) => set({ bio }),
      toggleFlexPrompt: () => set((s) => ({ flexPromptEnabled: !s.flexPromptEnabled })),
      toggleAchievementBadge: () => set((s) => ({ showAchievementBadge: !s.showAchievementBadge })),
      toggleCollectionEnabled: () => set((s) => ({ collectionEnabled: !s.collectionEnabled })),
      markRewardsGuideSeen: () => set({ rewardsGuideSeen: true }),
      toggleVisibility: (key) =>
        set((s) => ({ profileVisibility: { ...s.profileVisibility, [key]: !s.profileVisibility[key] } })),
      setAmbientTheme: (ambientTheme) => set({ ambientTheme }),
      pushRecentSetting: (id) => set((s) => ({
        recentSettingIds: [id, ...s.recentSettingIds.filter((x) => x !== id)].slice(0, RECENT_SETTINGS_LIMIT),
      })),
      resetAll: () => set({ ...DEFAULT_SETTINGS }),
    }),
    {
      name: 'app-settings',
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      // 구버전 저장소에 새 notifications 필드가 없어도 병합해 안전하게 복원한다.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return {
          ...current,
          ...p,
          notifications: { ...current.notifications, ...(p.notifications ?? {}) },
          // 구버전(카드 대분류 기반) 관심 분야 값은 새 설비·시설 목록에 없으므로 걸러낸다.
          interests: Array.isArray(p.interests) ? p.interests.filter(isInterestField) : current.interests,
          recentSettingIds: Array.isArray(p.recentSettingIds)
            ? p.recentSettingIds.filter((x): x is string => typeof x === 'string')
            : current.recentSettingIds,
        };
      },
    },
  ),
);

export const FONT_SCALE_FACTOR: Record<FontScale, number> = {
  xsmall: 0.8,
  small: 0.9,
  medium: 1,
  large: 1.15,
  xlarge: 1.3,
};