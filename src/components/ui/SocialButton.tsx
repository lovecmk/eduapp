import React from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';

const SOCIALS = [
  { key: 'google', icon: 'logo-google' as const, color: '#DB4437' },
  { key: 'facebook', icon: 'logo-facebook' as const, color: '#3B5998' },
  { key: 'kakao', icon: 'chatbubble-ellipses' as const, color: '#FEE500' },
  { key: 'apple', icon: 'logo-apple' as const, color: '#000' },
];

export function SocialButtonRow({ onPress }: { onPress?: (key: string) => void }) {
  const { theme, isDark } = useTheme();
  const c = theme.colors;

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16 }}>
      {SOCIALS.map((s) => (
        <Pressable
          key={s.key}
          onPress={() => onPress?.(s.key)}
          accessibilityRole="button"
          accessibilityLabel={`${s.key} 간편 로그인`}
          style={{
            width: 52, height: 52, borderRadius: 26,
            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F2F5FA',
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: c.border,
          }}
        >
          <Ionicons name={s.icon} size={22} color={s.key === 'kakao' ? (isDark ? '#fff' : '#3C1E1E') : s.color} />
        </Pressable>
      ))}
    </View>
  );
}
