import { ref, watch } from 'vue';

/**
 * 라이트/다크 테마.
 *
 * 운영 콘솔은 하루 종일 띄워 두는 화면이라 조명 환경에 맞출 수 있어야 한다.
 * 기본값은 **OS 설정을 따른다**(auto) — 사용자가 이미 표명한 선호를 무시하지 않는다.
 * 명시적으로 고르면 그때부터 그 선택이 우선한다.
 */

export type ThemeMode = 'auto' | 'light' | 'dark';

const KEY = 'eduadmin.theme';

function load(): ThemeMode {
  const raw = localStorage.getItem(KEY);
  return raw === 'light' || raw === 'dark' ? raw : 'auto';
}

export const themeMode = ref<ThemeMode>(load());
/** 실제로 적용 중인 테마(auto 가 해석된 결과). 화면이 아이콘을 고를 때 쓴다. */
export const resolvedTheme = ref<'light' | 'dark'>('light');

const media = window.matchMedia('(prefers-color-scheme: dark)');

function apply(): void {
  const dark = themeMode.value === 'dark' || (themeMode.value === 'auto' && media.matches);
  resolvedTheme.value = dark ? 'dark' : 'light';
  // 속성 하나만 바꾸면 CSS 변수 전체가 따라온다(요소를 일일이 건드리지 않는다).
  document.documentElement.setAttribute('data-theme', resolvedTheme.value);
}

// OS 설정이 바뀌면 auto 인 동안만 따라간다.
media.addEventListener('change', () => {
  if (themeMode.value === 'auto') apply();
});

watch(themeMode, (mode) => {
  if (mode === 'auto') localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, mode);
  apply();
});

/** 앱 시작 시 한 번 호출한다. */
export function initTheme(): void {
  apply();
}

/** 라이트 → 다크 → 자동 순환. */
export function cycleTheme(): void {
  themeMode.value =
    themeMode.value === 'light' ? 'dark' : themeMode.value === 'dark' ? 'auto' : 'light';
}

export const THEME_LABEL: Record<ThemeMode, string> = {
  auto: '시스템 설정',
  light: '라이트',
  dark: '다크',
};
