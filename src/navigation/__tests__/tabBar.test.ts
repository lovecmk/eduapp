import { APP_TABS, showAppTabBar } from '../tabBar';

it.each([
  ['(tabs)', 'index'], ['(tabs)', 'cards'], ['(tabs)', 'review'], ['(tabs)', 'stats'],
  ['contents'], ['content', '[id]'], ['settings'], ['profile'], ['notifications'], ['support'], ['legal'],
])('로그인 후 일반 화면 %s에서 공통 하단바를 유지한다', (...segments) => {
  expect(showAppTabBar(segments, true)).toBe(true);
  expect(showAppTabBar(segments, false)).toBe(false);
});

it.each([[], ['index'], ['(auth)', 'login'], ['(auth)', 'signup'], ['faction-select']])('진입·인증·가입 화면에는 하단바를 표시하지 않는다: %s', (...segments) => {
  expect(showAppTabBar(segments, true)).toBe(false);
});

it('모든 일반 화면에서 기존 다섯 탭으로 이동할 수 있다', () => {
  expect(APP_TABS.map(tab => tab.label)).toEqual(['홈', '학습', '복습', '커뮤니티', 'MY']);
});
