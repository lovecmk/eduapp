import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { fontCute } from '../../theme/tokens';

interface Props {
  message?: string;
  onRetry?: () => void;
  emoji?: string;
}

export function ErrorState({ message = '데이터를 불러오지 못했습니다', onRetry, emoji = '🥺' }: Props) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 40, paddingHorizontal: 20 }}>
      <Text style={{ fontSize: 40 * fs, marginBottom: 8 }}>{emoji}</Text>
      <Text style={{ color: c.textSecondary, fontSize: 14 * fs, textAlign: 'center', lineHeight: 20 * fs, marginBottom: 16 }}>{message}</Text>
      {onRetry && (
        <Pressable accessibilityRole="button" onPress={onRetry}
          style={{ backgroundColor: c.primary, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 24 }}>
          <Text style={{ color: c.textOnPrimary, fontWeight: '700', fontSize: 13 * fs, fontFamily: fontCute }}>다시 시도</Text>
        </Pressable>
      )}
    </View>
  );
}