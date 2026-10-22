import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Skeleton } from '../ui/Skeleton';

/** 복습 화면 첫 로딩 — 직접 골라 보기 6개, 분야별 목록 순서에 맞춘다. */
export function ReviewSkeleton() {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ padding: 20 }}>
        {/* 직접 골라 보기 */}
        <Skeleton width={90} height={15} style={{ marginBottom: 12 }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} width="47%" height={110} radius={16} style={{ flexGrow: 1 }} />
          ))}
        </View>

        {/* 학습한 카테고리 목록 */}
        <Skeleton width={90} height={15} style={{ marginTop: 26, marginBottom: 12 }} />
        <View style={{ gap: 10 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <View
              key={i}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                backgroundColor: c.surface,
                borderWidth: 1,
                borderColor: c.border,
                borderRadius: 16,
                padding: 16,
              }}
            >
              <Skeleton width={46} height={46} radius={14} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Skeleton width="35%" height={14} />
                  <Skeleton width="30%" height={12} />
                </View>
                <Skeleton width="100%" height={6} radius={3} />
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
