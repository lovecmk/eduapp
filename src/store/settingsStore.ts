import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CardCategory } from '../domain/models/LearningCard';

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
  /** 관심 분야(대분류) — 개인화용 */
  interests: CardCategory[];
  profileImage: string | null;

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
  toggleInterest: (cat: CardCategory) => void;
  setProfileImage: (uri: string | null) => void;
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
  dailyTarget: 10,
  shuffleCards: true,
  keepScreenOn: false,
  offlineMode: false,
  prioritizeWeakSpots: false,
  interests: [] as CardCategory[],
  profileImage: null as string | null,
};

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
      toggleInterest: (cat) => set((s) => ({
        interests: s.interests.includes(cat) ? s.interests.filter((x) => x !== cat) : [...s.interests, cat],
      })),
      setProfileImage: (uri) => set({ profileImage: uri }),
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