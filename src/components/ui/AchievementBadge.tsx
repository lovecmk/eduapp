import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCollectionStore } from '../../store/collectionStore';
import { useSettingsStore } from '../../store/settingsStore';
import { COLLECTIBLES } from '../../data/collectibles';
import { collectorTier } from '../../domain/collectorRank';
import { type RarityTier } from '../../utils/rarity';

type IconName = keyof typeof Ionicons.glyphMap;

/** 등급별 뱃지 — 파란 인증뱃지처럼 단순한 색+아이콘. 높을수록 화려하게. */
const BADGE_BY_TIER: Record<RarityTier, { icon: IconName; color: string; label: string }> = {
  common: { icon: 'leaf', color: '#22C55E', label: '새싹 수집가' },
  rare: { icon: 'shield-checkmark', color: '#2563EB', label: '정예 수집가' },
  epic: { icon: 'diamond', color: '#A855F7', label: '특급 수집가' },
  legendary: { icon: 'trophy', color: '#F59E0B', label: '수호신 수집가' },
};

/**
 * 수집률로 수집가 등급을 계산. 한 장도 없으면 null.
 *
 * 예전엔 '보유한 최고 등급 카드'를 썼는데, 천장 때문에 60팩 안에 누구나
 * 다이아몬드를 받는다 — 전원이 최고 뱃지를 다는 지표는 뜻이 없다.
 * 규칙 자체는 domain/collectorRank 에 있다(화면 밖에서 검사 가능하게).
 */
export function useTopBadgeTier(): RarityTier | null {
  const owned = useCollectionStore((s) => s.owned);
  return collectorTier(Object.keys(owned).filter((id) => owned[id] > 0).length, COLLECTIBLES.length);
}

interface Props {
  size?: number;
  /** 설정 무시하고 항상 표시(프로필 편집 미리보기 등) */
  force?: boolean;
}

/**
 * 닉네임 옆 성취 뱃지 — 보유한 최고 등급 카드를 파란 인증뱃지처럼 간단히 표출.
 * 설정(showAchievementBadge)으로 켜고 끌 수 있으며, 보유 카드가 없으면 렌더하지 않는다.
 */
export function AchievementBadge({ size = 16, force = false }: Props) {
  const show = useSettingsStore((s) => s.showAchievementBadge);
  const tier = useTopBadgeTier();

  if ((!show && !force) || !tier) return null;

  const meta = BADGE_BY_TIER[tier];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: meta.color,
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: `0 1px 3px ${meta.color}66`,
      }}
    >
      <Ionicons name={meta.icon} size={size * 0.62} color="#fff" />
    </View>
  );
}
