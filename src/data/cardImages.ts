import type { ImageSourcePropType } from 'react-native';

/**
 * 학습카드 이미지 레지스트리 — 번들된 로컬 이미지(assets/img)를 키로 매핑한다.
 * 카드의 imageUrl/answerImageUrl 값이 이 키(예: '1-1')이면 로컬 이미지를,
 * http(s) URL 이면 원격 이미지를 사용한다.
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
};

/** 카드 이미지 값(로컬 키 또는 원격 URL)을 expo-image source 로 해석. */
export function resolveCardImage(value?: string): ImageSourcePropType | undefined {
  if (!value) return undefined;
  if (CARD_IMAGES[value]) return CARD_IMAGES[value];
  if (/^https?:\/\//.test(value)) return { uri: value };
  return undefined;
}
