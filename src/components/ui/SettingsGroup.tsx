import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, fontCute } from '../../theme/tokens';
import { MeasureOffset, FocusAnchor } from '../settings/SettingsFocus';

/**
 * 제목이 달린 그룹 카드 — iOS 스타일의 묶음 리스트 룩을 만든다.
 *
 * 내부 컨테이너를 `MeasureOffset` 으로 감싸 자식(FocusAnchor)이 스크롤 기준 절대 y 를
 * 알 수 있게 한다 — 설정 검색에서 항목으로 바로 스크롤·하이라이트하기 위한 배선이다.
 */
export function SettingsGroup({
  title,
  caption,
  children,
}: {
  title?: string;
  /** 그룹 하단 보조 설명 — 그룹 전체에 걸리는 안내를 각 행에 반복하지 않기 위함. */
  caption?: string;
  children: React.ReactNode;
}) {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  return (
    <MeasureOffset style={{ marginTop: 22 }}>
      {title ? (
        <Text style={[styles.groupTitle, { color: c.textSecondary, fontSize: 12 * fontScale }]}>
          {title}
        </Text>
      ) : null}
      <MeasureOffset style={[styles.group, { backgroundColor: c.surface, borderColor: c.border }]}>
        {React.Children.toArray(children).filter(Boolean).map((child, i, arr) => (
          <MeasureOffset key={i}>
            {child}
            {i < arr.length - 1 ? (
              <View style={[styles.divider, { backgroundColor: c.border }]} />
            ) : null}
          </MeasureOffset>
        ))}
      </MeasureOffset>
      {caption ? (
        <Text style={[styles.caption, { color: c.textSecondary, fontSize: 11.5 * fontScale }]}>
          {caption}
        </Text>
      ) : null}
    </MeasureOffset>
  );
}

/**
 * 그룹 내 한 줄 항목 — 아이콘 + 라벨/설명 + 우측 값/컨트롤 또는 이동 셰브런.
 *
 * `anchorId` 를 주면 설정 검색에서 이 행으로 바로 스크롤·하이라이트할 수 있다.
 * (색인의 id 와 같은 값을 쓴다 — `src/constants/settingsIndex.ts`)
 */
export function SettingsItem({
  icon,
  iconColor,
  label,
  description,
  value,
  right,
  onPress,
  destructive,
  anchorId,
  badge,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  label: string;
  description?: string;
  /** 우측에 현재 값을 요약해 보여준다(예: 테마 '시스템'). 한 depth 를 아끼는 장치. */
  value?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  anchorId?: string;
  /** 'NEW' 같은 짧은 강조 태그. */
  badge?: string;
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[styles.label, { color: destructive ? c.error : c.textPrimary, fontSize: 15 * fontScale }]}>
            {label}
          </Text>
          {badge ? (
            <View style={{ backgroundColor: c.primary + '18', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1.5 }}>
              <Text style={{ color: c.primary, fontSize: 10 * fontScale, fontWeight: '800', fontFamily: fontCute }}>{badge}</Text>
            </View>
          ) : null}
        </View>
        {description ? (
          <Text style={[styles.desc, { color: c.textSecondary, fontSize: 12 * fontScale }]}>
            {description}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text
          style={{ color: c.textSecondary, fontSize: 13 * fontScale, fontFamily: fontCute, maxWidth: 130 }}
          numberOfLines={1}
        >
          {value}
        </Text>
      ) : null}
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={c.textSecondary} /> : null)}
    </Animated.View>
  );

  const body = !onPress ? content : (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={description ? `${label}. ${description}` : label}
      onPressIn={() => { pressed.value = withTiming(1, { duration: 80 }); }}
      onPressOut={() => { pressed.value = withTiming(0, { duration: 160 }); }}
    >
      {content}
    </Pressable>
  );

  return anchorId ? <FocusAnchor id={anchorId}>{body}</FocusAnchor> : body;
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
  caption: { marginTop: 7, marginLeft: 6, marginRight: 6, lineHeight: 17 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 58 },
});
