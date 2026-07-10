import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  };
  biometricLoginEnabled: boolean;
  dailyTarget: number;
  shuffleCards: boolean;
  keepScreenOn: boolean;
  offlineMode: boolean;
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
  setProfileImage: (uri: string | null) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      themeMode: 'system',
      fontScale: 'medium',
      highContrast: false,
      notifications: { enabled: true, dailyReminderTime: '09:00', reviewAlerts: true, weeklyReport: true },
      biometricLoginEnabled: false,
      dailyTarget: 10,
      shuffleCards: true,
      keepScreenOn: false,
      offlineMode: false,
      profileImage: null,

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
      setProfileImage: (uri) => set({ profileImage: uri }),
    }),
    { name: 'app-settings', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

export const FONT_SCALE_FACTOR: Record<FontScale, number> = {
  xsmall: 0.8,
  small: 0.9,
  medium: 1,
  large: 1.15,
  xlarge: 1.3,
};