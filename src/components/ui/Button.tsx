// 핵심 컴포넌트: Button (Filled / Outline, pill) — PART 2.4
// colorOverride 로 시맨틱 컬러(success/error)와 UI 키트 형태를 동시 만족 — PART 3.3
import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, type ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring } from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeProvider';
import { radius } from '../../theme/tokens';
import { hapticTap } from '../../utils/haptics';

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
  haptic = true,
}: {
  label: string;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  onPress?: () => void;
  colorOverride?: string;
  colorOverridePressed?: string;
  style?: ViewStyle;
  /** 손가락이 닿는 순간 주는 가벼운 촉감(기본 on). 결과 알림 햅틱과 겹치면 false 로 끈다. */
  haptic?: boolean;
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
        onPressIn={() => {
          scale.value = withTiming(0.94, { duration: 90 });
          // 손끝이 닿는 즉시(누름 확정 전) 미세 확인감 — 반응이 빠르게 느껴진다.
          if (haptic && !disabled && !loading) hapticTap();
        }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 9, stiffness: 260 }); }}
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
