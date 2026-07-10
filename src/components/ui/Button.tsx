// 핵심 컴포넌트: Button (Filled / Outline, pill) — PART 2.4
// colorOverride 로 시맨틱 컬러(success/error)와 UI 키트 형태를 동시 만족 — PART 3.3
import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, type ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeProvider';
import { radius } from '../../theme/tokens';

type Variant = 'filled' | 'outline';

export function Button({
  label,
  variant = 'filled',
  disabled,
  loading,
  onPress,
  colorOverride,
  colorOverridePressed,
  style,
}: {
  label: string;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  onPress?: () => void;
  colorOverride?: string;
  colorOverridePressed?: string;
  style?: ViewStyle;
}) {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  const accent = colorOverride ?? c.primary;
  const accentPressed = colorOverridePressed ?? colorOverride ?? c.primaryPressed;
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        disabled={disabled || loading}
        onPressIn={() => { scale.value = withTiming(0.97, { duration: 80 }); }}
        onPressOut={() => { scale.value = withTiming(1, { duration: 120 }); }}
        style={({ pressed }) => [
          styles.base,
          variant === 'filled' && {
            backgroundColor: disabled ? c.disabled : pressed ? accentPressed : accent,
          },
          variant === 'outline' && {
            backgroundColor: pressed ? accent : 'transparent',
            borderWidth: 1.5,
            borderColor: disabled ? c.disabled : accent,
          },
          style,
        ]}
      >
        {({ pressed }) =>
          loading ? (
            <ActivityIndicator color={variant === 'filled' ? c.textOnPrimary : accent} />
          ) : (
            <Text
              style={[
                styles.label,
                { fontSize: 15 * fontScale },
                {
                  color:
                    variant === 'filled'
                      ? c.textOnPrimary
                      : pressed
                        ? c.textOnPrimary
                        : accent,
                },
                disabled && { color: c.textSecondary },
              ]}
            >
              {label}
            </Text>
          )
        }
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 48,
    borderRadius: radius.pillButton, // UI 키트의 시그니처: 알약형
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  label: { fontWeight: '700', letterSpacing: 0.3 },
});
