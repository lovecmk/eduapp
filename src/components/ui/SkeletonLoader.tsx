import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Skeleton, SkeletonCircle } from './Skeleton';

// 리스트형 스켈레톤 — 아바타 + 두 줄 텍스트 행을 count 개 만큼 반복한다.
// (기존 호출부 호환을 위해 API 유지: `<SkeletonLoader count={n} />`)
export function SkeletonLoader({ count = 3 }: { count?: number }) {
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <View style={{ padding: 20 }}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            borderRadius: 14,
            padding: 14,
            marginBottom: 10,
            borderWidth: 1,
            backgroundColor: c.surface,
            borderColor: c.border,
          }}
        >
          <SkeletonCircle size={34} style={{ marginRight: 12 }} />
          <View style={{ flex: 1 }}>
            <Skeleton width="70%" height={14} />
            <Skeleton width="40%" height={14} style={{ marginTop: 6 }} />
          </View>
        </View>
      ))}
    </View>
  );
}
