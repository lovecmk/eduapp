import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, fontCute } from '../../theme/tokens';

/** 제목이 달린 그룹 카드 — iOS 스타일의 묶음 리스트 룩을 만든다. */
export function SettingsGroup({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  return (
    <View style={{ marginTop: 22 }}>
      {title ? (
        <Text style={[styles.groupTitle, { color: c.textSecondary, fontSize: 12 * fontScale }]}>
          {title}
        </Text>
      ) : null}
      <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.border }]}>
        {React.Children.toArray(children).filter(Boolean).map((child, i, arr) => (
          <View key={i}>
            {child}
            {i < arr.length - 1 ? (
              <View style={[styles.divider, { backgroundColor: c.border }]} />
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

/** 그룹 내 한 줄 항목 — 아이콘 + 라벨/설명 + 우측 컨트롤 또는 이동 셰브런. */
export function SettingsItem({
  icon,
  iconColor,
  label,
  description,
  right,
  onPress,
  destructive,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  label: string;
  description?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  destructive?: boolean;
}) {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  const tint = destructive ? c.error : iconColor ?? c.primary;
  const pressed = useSharedValue(0);
  const bgStyle = useAnimatedStyle(() => ({
    backgroundColor: pressed.value ? c.surfaceAlt : 'transparent',
  }));

  const content = (
    <Animated.View style={[styles.item, bgStyle]}>
      <View style={[styles.iconWrap, { backgroundColor: tint + '18' }]}>
        <Ionicons name={icon} size={17} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.label, { color: destructive ? c.error : c.textPrimary, fontSize: 15 * fontScale }]}>
          {label}
        </Text>
        {description ? (
          <Text style={[styles.desc, { color: c.textSecondary, fontSize: 12 * fontScale }]}>
            {description}
          </Text>
        ) : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={c.textSecondary} /> : null)}
    </Animated.View>
  );

  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => { pressed.value = withTiming(1, { duration: 80 }); }}
      onPressOut={() => { pressed.value = withTiming(0, { duration: 160 }); }}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  groupTitle: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginLeft: 4,
    fontFamily: fontCute,
  },
  group: { borderRadius: radius.card, borderWidth: 1, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13, minHeight: 56 },
  iconWrap: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  label: { fontWeight: '600', fontFamily: fontCute },
  desc: { marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 58 },
});
