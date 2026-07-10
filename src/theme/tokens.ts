export const lightTheme = {
  mode: 'light' as const,
  colors: {
    primary: '#2563EB',
    primaryPressed: '#1D4ED8',
    bg: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceAlt: '#F2F5FA',
    border: '#DEE2E8',
    textPrimary: '#1A1D24',
    textSecondary: '#8E95A2',
    textOnPrimary: '#FFFFFF',
    success: '#34C759',
    warning: '#FF9500',
    error: '#FF3B30',
    disabled: '#D1D5DC',
    facebook: '#3B5998',
    twitter: '#1DA1F2',
    google: '#DB4437',
  },
  shadow: { color: '#0F172A', opacity: 0.08, radius: 16, offsetY: 6 },
};

export const darkTheme = {
  mode: 'dark' as const,
  colors: {
    primary: '#60A5FA',
    primaryPressed: '#3B82F6',
    bg: '#0F1118',
    surface: '#1A1D28',
    surfaceAlt: '#242736',
    border: '#2E3140',
    textPrimary: '#F2F3F8',
    textSecondary: '#9CA0B0',
    textOnPrimary: '#FFFFFF',
    success: '#30D158',
    warning: '#FF9F0A',
    error: '#FF453A',
    disabled: '#3A3D4C',
    facebook: '#4A6CB3',
    twitter: '#3DB2F5',
    google: '#E5685C',
  },
  shadow: { color: '#000000', opacity: 0.45, radius: 16, offsetY: 6 },
};

export const radius = {
  pillButton: 999,
  input: 8,
  card: 16,
  iconCircle: 999,
} as const;

export const glassSurface = {
  light: {
    bg: 'rgba(255,255,255,0.55)',
    bgFallback: '#F0F2F5',
    border: 'rgba(0,0,0,0.06)',
    shadow: { color: '#000000', opacity: 0.08, radius: 24, offsetY: 8 },
  },
  dark: {
    bg: 'rgba(15,17,24,0.6)',
    bgFallback: '#0F1118',
    border: 'rgba(255,255,255,0.08)',
    shadow: { color: '#000000', opacity: 0.3, radius: 24, offsetY: 8 },
  },
};

import { Platform } from 'react-native';
export const fontMono = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
}) as string;

// 타이포그래피 시스템 — 전 화면을 Pretendard 로 통일해 이질감을 없앤다.
// 브랜드 워드마크/로고(BrandWordmark)만 'Jua-Regular' 문자열을 직접 사용해 아이덴티티를 유지.
export const fontBody = 'Pretendard-Regular';
export const fontMedium = 'Pretendard-Medium';
export const fontDisplay = 'Pretendard-SemiBold'; // 제목/숫자 강조
export const fontBold = 'Pretendard-Bold';
/** (레거시 별칭) 과거 Jua 헤딩에 쓰이던 토큰 — 이제 Pretendard 로 통일. */
export const fontCute = fontDisplay;

// expo-font 로 로드할 폰트 맵(단일 소스). _layout 에서 참조.
export const APP_FONTS = {
  'Jua-Regular': require('../../assets/fonts/Jua-Regular.ttf'),
  'Pretendard-Regular': require('../../assets/fonts/Pretendard-Regular.otf'),
  'Pretendard-Medium': require('../../assets/fonts/Pretendard-Medium.otf'),
  'Pretendard-SemiBold': require('../../assets/fonts/Pretendard-SemiBold.otf'),
  'Pretendard-Bold': require('../../assets/fonts/Pretendard-Bold.otf'),
};

export const dimTheme = {
  mode: 'dim' as const,
  colors: {
    primary: '#818CF8',
    primaryPressed: '#6366F1',
    bg: '#1C1920',
    surface: '#2A2530',
    surfaceAlt: '#332E3A',
    border: '#3D3845',
    textPrimary: '#E8E0D8',
    textSecondary: '#9C9290',
    textOnPrimary: '#FFFFFF',
    success: '#30D158',
    warning: '#FFB454',
    error: '#FF453A',
    disabled: '#4A4450',
    facebook: '#4A6CB3',
    twitter: '#3DB2F5',
    google: '#E5685C',
  },
  shadow: { color: '#000000', opacity: 0.4, radius: 16, offsetY: 6 },
};

export function shadowBox(sh: typeof lightTheme.shadow): string {
  const r = parseInt(sh.color.slice(1, 3), 16);
  const g = parseInt(sh.color.slice(3, 5), 16);
  const b = parseInt(sh.color.slice(5, 7), 16);
  return `0 ${sh.offsetY}px ${sh.radius}px rgba(${r},${g},${b},${sh.opacity})`;
}

export type Theme = {
  mode: 'light' | 'dark' | 'dim';
  colors: typeof lightTheme.colors;
  shadow: typeof lightTheme.shadow;
};