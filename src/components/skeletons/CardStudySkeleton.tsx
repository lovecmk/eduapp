import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Skeleton } from '../ui/Skeleton';

/** 학습(카드) 화면 첫 로딩 스켈레톤 — 진행바 + 큰 플래시카드 + 하단 컨트롤 자리. */
export function CardStudySkeleton() {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* 상단 진행 영역 */}
      <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          <Skeleton width={110} height={14} />
          <Skeleton width={40} height={12} />
        </View>
        <Skeleton width="100%" height={6} radius={3} />
      </View>

      {/* 카드 본체 */}
      <View style={{ flex: 1, padding: 20, paddingBottom: 8 }}>
        <View
          style={{
            flex: 1,
            backgroundColor: c.surface,
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 20,
            padding: 24,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Skeleton width={72} height={22} radius={11} />
            <Skeleton width={30} height={12} />
          </View>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
            <Skeleton width={64} height={64} radius={20} />
            <Skeleton width="80%" height={16} />
            <Skeleton width="65%" height={16} />
            <Skeleton width="40%" height={16} />
          </View>
        </View>
      </View>

      {/* 하단 컨트롤 */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 24, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.border }}>
        <Skeleton width="100%" height={50} radius={14} style={{ marginBottom: 10 }} />
        <Skeleton width="55%" height={16} radius={8} style={{ alignSelf: 'center' }} />
      </View>
    </View>
  );
}
