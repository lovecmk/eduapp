import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontDisplay, fontBody, fontMono } from '../../theme/tokens';

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * 카드 안 섹션 제목 — 색을 입힌 둥근 아이콘 칩 + 제목 (+ 개수 · 오른쪽 안내).
 * 복습 상세의 현장 팁 · 처음 선택한 답변 · 체감 난이도가 같은 모양을 쓴다.
 */
export function SectionTitle({ icon, color, title, count, caption, size = 'md' }: {
  icon: IconName;
  color: string;
  title: string;
  count?: number;
  caption?: string;
  /** sm: 한 카드 안의 두 번째 섹션처럼 조금 작게 */
  size?: 'md' | 'sm';
}) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const chip = size === 'md' ? 30 : 26;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={{ width: chip, height: chip, borderRadius: chip * 0.34, backgroundColor: color + '1F', alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons name={icon} size={size === 'md' ? 17 : 15} color={color} />
      </View>
      <Text accessibilityRole="header" style={{ color: c.textPrimary, fontSize: (size === 'md' ? 14.5 : 13.5) * fs, lineHeight: (size === 'md' ? 21 : 20) * fs, fontFamily: fontDisplay }}>
        {title}
      </Text>
      {count !== undefined && (
        <View style={{ backgroundColor: color + '17', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 1 }}>
          <Text style={{ color, fontSize: 11 * fs, fontFamily: fontMono }}>{count}</Text>
        </View>
      )}
      {!!caption && (
        <Text style={{ color: c.textSecondary, fontSize: 11 * fs, lineHeight: 17 * fs, marginLeft: 'auto', fontFamily: fontBody, flexShrink: 1 }}>
          {caption}
        </Text>
      )}
    </View>
  );
}
