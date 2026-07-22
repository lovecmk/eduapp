import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, sectionCardShadow } from '../../theme/tokens';

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { theme } = useTheme();
  const c = theme.colors;
  // 모든 섹션 카드(캘린더 등 포함)와 '같은' 옅고 짧은 그림자를 공유해 톤을 통일한다.
  const softShadow = sectionCardShadow(theme.shadow);
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
          boxShadow: softShadow,
          elevation: 1,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
