import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { radius } from '../../theme/tokens';

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { theme } = useTheme();
  const c = theme.colors;
  // 커뮤니티 섹션 카드와 동일하게 그림자 없이 테두리만으로 마감해 톤을 통일한다
  // (홈·통계 등 모든 섹션 카드가 커뮤니티와 같은 플랫한 느낌을 갖도록).
  return (
    <View
      style={[
        {
          backgroundColor: c.surface,
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: radius.card,
          padding: 16,
          marginBottom: 14,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
