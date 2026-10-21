/** Tabs stay available throughout the signed-in app, beneath modal overlays. */
export function showAppTabBar(segments: readonly string[], signedIn: boolean): boolean {
  const first = segments[0];
  return signedIn && !!first && !['(auth)', 'faction-select', 'index', '+not-found'].includes(first);
}

export const APP_TABS = [
  { name: 'index', label: '홈', path: '/(tabs)', active: 'home', inactive: 'home-outline' },
  { name: 'cards', label: '학습', path: '/(tabs)/cards', active: 'school', inactive: 'school-outline' },
  { name: 'review', label: '복습', path: '/(tabs)/review', active: 'refresh-circle', inactive: 'refresh-outline' },
  { name: 'community', label: '커뮤니티', path: '/(tabs)/community', active: 'people', inactive: 'people-outline' },
  { name: 'mypage', label: 'MY', path: '/(tabs)/mypage', active: 'person-circle', inactive: 'person-circle-outline' },
] as const;
