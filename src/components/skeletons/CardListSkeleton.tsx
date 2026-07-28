import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Skeleton } from '../ui/Skeleton';

/**
 * 카드 목록(모아 보기) 첫 로딩 스켈레톤 — 썸네일 + 두 줄 텍스트의 가로 행.
 *
 * ContentsSkeleton 을 돌려쓰지 않는다. 그쪽은 검색바와 과정 카드가 먼저 오는
 * 화면이라, 여기서 쓰면 실제로 나타날 것과 다른 모양이 잠깐 보였다가 튄다.
 * 스켈레톤의 목적은 '곧 올 것의 자리'를 잡아 주는 것이므로 모양이 맞아야 한다.
 */
export function CardListSkeleton({ rows = 6 }: { rows?: number }) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, padding: 20, paddingTop: 12, gap: 10 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            gap: 12,
            alignItems: 'center',
            backgroundColor: c.surface,
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 16,
            padding: 12,
          }}
        >
          <Skeleton width={56} height={56} radius={12} />
          <View style={{ flex: 1, gap: 7 }}>
            <Skeleton width="45%" height={9} />
            <Skeleton width="92%" height={12} />
            <Skeleton width="30%" height={9} />
          </View>
        </View>
      ))}
    </View>
  );
}
