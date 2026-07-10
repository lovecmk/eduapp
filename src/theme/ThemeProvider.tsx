import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { lightTheme, darkTheme, dimTheme, type Theme } from './tokens';
import { useSettingsStore, FONT_SCALE_FACTOR, type FontScale } from '../store/settingsStore';

interface ThemeContextValue {
  theme: Theme;
  isDark: boolean;
  fontScale: number;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: lightTheme,
  isDark: false,
  fontScale: 1,
});

function applyHighContrast(theme: Theme): Theme {
  return {
    ...theme,
    colors: {
      ...theme.colors,
      border: theme.mode === 'dark' || theme.mode === 'dim' ? '#FFFFFF' : '#000000',
      textSecondary: theme.mode === 'dark' || theme.mode === 'dim' ? '#D6D8DE' : '#3A3C42',
    },
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const themeMode = useSettingsStore((s) => s.themeMode);
  const highContrast = useSettingsStore((s) => s.highContrast);
  const fontScaleSetting: FontScale = useSettingsStore((s) => s.fontScale);

  const value = useMemo<ThemeContextValue>(() => {
    let isDark: boolean;
    let theme: Theme;
    switch (themeMode) {
      case 'light':
        isDark = false;
        theme = lightTheme;
        break;
      case 'dark':
        isDark = true;
        theme = darkTheme;
        break;
      case 'dim':
        isDark = true;
        theme = dimTheme;
        break;
      case 'system':
      default:
        isDark = systemScheme === 'dark';
        theme = isDark ? darkTheme : lightTheme;
        break;
    }
    if (highContrast) theme = applyHighContrast(theme);
    return { theme, isDark, fontScale: FONT_SCALE_FACTOR[fontScaleSetting] };
  }, [themeMode, systemScheme, highContrast, fontScaleSetting]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);