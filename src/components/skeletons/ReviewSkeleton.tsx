import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Skeleton } from '../ui/Skeleton';

/** 복습 화면 첫 로딩 스켈레톤 — 제목 + 카테고리 카드 목록 + 모아 보기 그리드 자리. */
export function ReviewSkeleton() {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ padding: 20 }}>
        <Skeleton width={80} height={22} />
        <Skeleton width="60%" height={13} style={{ marginTop: 8, marginBottom: 18 }} />

        {/* 학습한 카테고리 목록 */}
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

        {/* 모아 보기 */}
        <Skeleton width={90} height={15} style={{ marginTop: 26, marginBottom: 12 }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} width="47%" height={96} radius={16} style={{ flexGrow: 1 }} />
          ))}
        </View>
      </View>
    </View>
  );
}
