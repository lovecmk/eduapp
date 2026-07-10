import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, shadowBox } from '../../theme/tokens';

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { theme } = useTheme();
  const c = theme.colors;
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
          boxShadow: shadowBox(theme.shadow),
          elevation: 3,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
