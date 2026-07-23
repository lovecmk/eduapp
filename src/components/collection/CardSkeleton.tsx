import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeProvider';
import { COLLECTIBLE_ASPECT } from './CollectibleCard';

/**
 * 도감 카드 로딩 자리표시(스켈레톤).
 * 무거운 SVG 카드를 한꺼번에 그리지 않고, 스크롤로 더 불러오는 동안
 * 은은하게 명멸하는 자리표시를 보여줘 체감 속도를 높인다.
 */
function CardSkeletonBase({ width }: { width: number }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const W = width;
  const H = Math.round(W / COLLECTIBLE_ASPECT);
  const k = W / 150;
  const R = Math.round(16 * k);

  const pulse = useSharedValue(0.45);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(0.9, { duration: 720, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse]);
  const animStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      style={[
        { width: W, height: H, borderRadius: R, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border, overflow: 'hidden', padding: 10 * k, justifyContent: 'space-between' },
        animStyle,
      ]}
    >
      {/* 상단 배지 자리 */}
      <View style={{ width: W * 0.34, height: 12 * k, borderRadius: 999, backgroundColor: c.surface }} />
      {/* 가운데 아트 자리 */}
      <View style={{ alignSelf: 'center', width: W * 0.44, height: W * 0.44, borderRadius: 999, backgroundColor: c.surface }} />
      {/* 하단 이름 자리 */}
      <View style={{ gap: 4 * k }}>
        <View style={{ width: '78%', height: 10 * k, borderRadius: 4, backgroundColor: c.surface, alignSelf: 'center' }} />
        <View style={{ width: '48%', height: 8 * k, borderRadius: 4, backgroundColor: c.surface, alignSelf: 'center' }} />
      </View>
    </Animated.View>
  );
}

export const CardSkeleton = React.memo(CardSkeletonBase);
