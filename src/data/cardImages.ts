import type { ImageSourcePropType } from 'react-native';
import { env } from './network/env';
import { peekItem, StorageKeys } from './storage/secureStorage';

/**
 * 학습카드 사진을 화면이 쓸 수 있는 source 로 푼다.
 *
 * 카드의 image_url 에는 **출처가 다른 세 가지**가 들어온다. 셋을 한 함수가
 * 받아야 화면들이 "이건 어느 쪽이지" 를 매번 다시 묻지 않는다.
 *
 *  1) 번들 키 ('1-1', '8-2' …)  시드와 함께 배포되는 사진. assets/img 에 있다.
 *  2) 서버 경로 ('/inner/api/v1/cards/images/…')  콘솔에서 올려 발행한 사진.
 *  3) 절대 주소 ('https://…')   외부에 올려 둔 사진.
 *
 * ── 2번이 그동안 깨져 있었다 ────────────────────────────────────────────────
 * 서버가 발행하는 주소는 **호스트가 없는 경로**다(studio_service.CardImageURL).
 * 예전 이 함수는 `http(s)://` 로 시작하지 않으면 undefined 를 돌려줬고, 그래서
 * 콘솔에서 사진을 붙여 발행한 카드는 앱에서 **사진 칸 자체가 없었다.** 오류도
 * 로그도 나지 않는다 — 운영자는 콘솔 미리보기로 사진을 보고 있으니 앱에서도
 * 보이는 줄 안다. 앞으로 사진은 대부분 이 경로로 들어오므로 여기가 맞아야 한다.
 *
 * ── 왜 헤더를 실어야 하나 ───────────────────────────────────────────────────
 * 그 주소는 로그인한 사람만 볼 수 있다 — 현장 사진에는 아직 가림 처리가 끝나지
 * 않은 것이 섞일 수 있어 주소만 알면 누구나 보는 상태로 열어 두지 않는다.
 * 그래서 사진 요청에도 액세스 토큰을 싣는다(expo-image 는 source 의 headers 를
 * 그대로 쓴다).
 *
 * 웹(react-native-web)에서는 <img> 가 헤더를 실을 수 없어 이 경로가 401 로
 * 실패한다. 배포 대상은 안드로이드·iOS 라(eas.json) 실사용에는 영향이 없고,
 * 웹 미리보기에서는 QuestionImage 가 '불러올 수 없어요' 자리를 남긴다.
 */
export const CARD_IMAGES: Record<string, ImageSourcePropType> = {
  '1-1': require('../../assets/img/1-1.png'),
  '1-2': require('../../assets/img/1-2.jpg'),
  '2-1': require('../../assets/img/2-1.jpg'),
  '2-2': require('../../assets/img/2-2.jpg'),
  '3-1': require('../../assets/img/3-1.jpg'),
  '3-2': require('../../assets/img/3-2.jpg'),
  '4': require('../../assets/img/4.jpg'),
  '5-1': require('../../assets/img/5-1.jpg'),
  '5-2': require('../../assets/img/5-2.jpg'),
  '6-1': require('../../assets/img/6-1.jpg'),
  '6-2': require('../../assets/img/6-2.jpg'),
  '7': require('../../assets/img/7.jpg'),
  '8-1': require('../../assets/img/8-1.jpg'),
  '8-2': require('../../assets/img/8-2.jpg'),
  '9': require('../../assets/img/9.jpg'),
  '10': require('../../assets/img/10.jpg'),
  '11': require('../../assets/img/11.jpg'),
};

/**
 * 이 카드가 사진을 **가지고 있다고 말하는가**.
 *
 * 푸는 데 성공했는가와는 다른 질문이다. 둘을 구분하지 않으면 사진을 못 푼
 * 카드에서 사진 칸이 통째로 사라져, 학습자는 '사진 없는 문제'로 읽고 넘어간다.
 * 그런데 이런 카드의 문제는 대개 "어떤 문제점이 있을까?" 라서 사진이 없으면
 * 아예 풀 수가 없다 — **못 푸는 것과 없는 것은 화면에서 달라야 한다.**
 */
export function hasCardImage(value?: string): boolean {
  return (value ?? '').trim().length > 0;
}

/** 카드 이미지 값(번들 키·서버 경로·절대 주소)을 expo-image source 로 해석. */
export function resolveCardImage(value?: string): ImageSourcePropType | undefined {
  const key = (value ?? '').trim();
  if (!key) return undefined;
  if (CARD_IMAGES[key]) return CARD_IMAGES[key];
  if (/^https?:\/\//i.test(key)) return { uri: key };
  if (key.startsWith('/')) {
    // 서버가 발행한 사진 — 호스트를 앞에 붙이고 토큰을 함께 보낸다.
    // 주소가 없는 빌드(목업)에는 붙일 호스트가 없으니 푸는 데 실패한 것으로 둔다.
    if (!env.apiBaseUrl) return undefined;
    const token = peekItem(StorageKeys.accessToken);
    return {
      uri: `${env.apiBaseUrl}${key}`,
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    };
  }
  return undefined;
}
