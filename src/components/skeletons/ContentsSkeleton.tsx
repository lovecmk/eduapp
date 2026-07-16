import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Skeleton } from '../ui/Skeleton';

/** 학습 목표(컨텐츠) 화면 첫 로딩 스켈레톤 — 검색바 + 가로 과정 카드 + 세로 목록 자리. */
export function ContentsSkeleton() {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* 검색바 */}
      <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        <Skeleton width="100%" height={44} radius={14} />
      </View>

      {/* 과정(가로 스크롤) 카드 */}
      <Skeleton width={120} height={12} style={{ marginTop: 20, marginBottom: 12, marginLeft: 20 }} />
      <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 20 }}>
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} width={168} height={150} radius={18} />
        ))}
      </View>

      {/* 전체 둘러보기 목록 */}
      <Skeleton width={100} height={12} style={{ marginTop: 22, marginBottom: 12, marginLeft: 20 }} />
      <View style={{ paddingHorizontal: 20, gap: 10 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <View
            key={i}
            style={{
              flexDirection: 'row',
              gap: 12,
              backgroundColor: c.surface,
              borderWidth: 1,
              borderColor: c.border,
              borderRadius: 16,
              padding: 12,
            }}
          >
            <Skeleton width={56} height={56} radius={12} />
            <View style={{ flex: 1 }}>
              <Skeleton width="40%" height={11} />
              <Skeleton width="90%" height={14} style={{ marginTop: 6 }} />
              <Skeleton width="55%" height={11} style={{ marginTop: 8 }} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
