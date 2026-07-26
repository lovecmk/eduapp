import type { ViewStyle } from 'react-native';

/**
 * 본문 콘텐츠의 최대 폭.
 *
 * 이 앱은 휴대폰 우선으로 만들어졌지만 웹(태블릿·데스크톱)에서도 열린다.
 * 폭 제한이 없으면 1280px 화면에서 히어로·통계 타일·진행바가 화면 끝까지 늘어나
 * 글자만 덩그러니 떠 있는 '깨진' 화면이 된다. 한 줄에 들어가는 글자 수도 너무 많아
 * 가독성이 떨어진다(적정 행 길이 ~45~75자).
 *
 * 그래서 본문은 이 폭까지만 넓어지고 가운데 정렬한다. 배경(날씨 앰비언트)과
 * 앱바·탭바는 제한하지 않아 화면 전체를 채운다 — 앱처럼 보이되 넓은 화면에서도 단정하다.
 */
export const CONTENT_MAX_WIDTH = 560;

/** 스크롤 콘텐츠에 얹는 '가운데 정렬된 본문 칼럼' 스타일. */
export const contentColumn: ViewStyle = {
  width: '100%',
  maxWidth: CONTENT_MAX_WIDTH,
  alignSelf: 'center',
};
