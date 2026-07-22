import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, shadowBox } from '../../theme/tokens';

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { theme } = useTheme();
  const c = theme.colors;
  // 다른 섹션(캘린더·라이브 프레즌스 등)은 테두리 위주라 그림자가 옅다. Card 만 그림자가
  // 진하면 홈에서 '오늘의 학습·학습 현황'만 붕 떠 보인다 → 옅고 짧은 그림자로 톤을 통일한다.
  const softShadow = shadowBox({ ...theme.shadow, opacity: theme.shadow.opacity * 0.45, radius: 8, offsetY: 2 });
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
