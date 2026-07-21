import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Skeleton, SkeletonCard } from '../ui/Skeleton';

/** 통계 화면 첫 로딩 스켈레톤 — 상단 지표 타일 + 공유 배너 + 여러 분석 카드 자리. */
export function StatsSkeleton() {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ padding: 20 }}>
        {/* 상단 지표 타일 4개 */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} width="23%" height={72} radius={14} />
          ))}
        </View>

        {/* 성취 카드 만들기 배너 */}
        <Skeleton width="100%" height={72} radius={16} style={{ marginBottom: 20 }} />

        {/* 분석 카드들 */}
        {[140, 120, 150].map((h, i) => (
          <SkeletonCard key={i}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 }}>
              <Skeleton width={16} height={16} radius={5} />
              <Skeleton width="45%" height={14} />
            </View>
            <Skeleton width="100%" height={h} radius={12} />
          </SkeletonCard>
        ))}
      </View>
    </View>
  );
}
