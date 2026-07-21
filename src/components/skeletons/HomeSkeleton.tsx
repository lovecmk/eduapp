import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Skeleton, SkeletonCircle, SkeletonCard } from '../ui/Skeleton';

/** 홈(오늘의 학습) 첫 로딩 스켈레톤 — 히어로 + 학습/복습 + 학습 현황 + 캘린더 자리를 흉내 낸다. */
export function HomeSkeleton() {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ padding: 20 }}>
        {/* 히어로 */}
        <View
          style={{
            borderRadius: 22,
            backgroundColor: c.surfaceAlt,
            borderWidth: 1,
            borderColor: c.border,
            padding: 18,
            minHeight: 160,
            marginBottom: 14,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <SkeletonCircle size={48} />
            <View style={{ flex: 1 }}>
              <Skeleton width="45%" height={11} />
              <Skeleton width="65%" height={16} style={{ marginTop: 8 }} />
            </View>
          </View>
          <Skeleton width="90%" height={12} style={{ marginTop: 16 }} />
          <Skeleton width="55%" height={12} style={{ marginTop: 8 }} />
        </View>

        {/* 라이브 스트립 */}
        <Skeleton width="100%" height={38} radius={999} style={{ marginBottom: 14 }} />

        {/* 학습 시작 · 복습 */}
        <SkeletonCard>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Skeleton width="48%" height={72} radius={14} />
            <Skeleton width="48%" height={72} radius={14} />
          </View>
        </SkeletonCard>

        {/* 학습 현황 */}
        <SkeletonCard>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
            <Skeleton width={80} height={14} />
            <Skeleton width={48} height={14} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Skeleton width="31%" height={66} radius={12} />
            <Skeleton width="31%" height={66} radius={12} />
            <Skeleton width="31%" height={66} radius={12} />
          </View>
        </SkeletonCard>

        {/* 캘린더 */}
        <SkeletonCard>
          <Skeleton width="40%" height={14} style={{ marginBottom: 14 }} />
          <Skeleton width="100%" height={120} radius={12} />
        </SkeletonCard>
      </View>
    </View>
  );
}
