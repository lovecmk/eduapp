import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontBody, fontMedium } from '../../theme/tokens';
import { getCategoryColor } from '../../constants/categories';

/** 대분류 › 중분류 › 소분류 경로를 한 줄로 보여주는 브레드크럼. */
export function CategoryTrail({
  category,
  subCategory,
  topic,
  size = 'md',
}: {
  category: string;
  subCategory?: string;
  topic?: string;
  size?: 'sm' | 'md';
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const accent = getCategoryColor(category) ?? c.primary;
  const fontSize = size === 'sm' ? 11 : 12.5;
  const parts = [category, subCategory, topic].filter(Boolean) as string[];

  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: accent }]} />
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <Ionicons name="chevron-forward" size={fontSize - 1} color={c.textSecondary} style={{ marginHorizontal: 1 }} />
          )}
          <Text
            style={{
              color: i === 0 ? accent : c.textSecondary,
              fontSize,
              fontFamily: i === parts.length - 1 ? fontMedium : fontBody,
            }}
          >
            {p}
          </Text>
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  dot: { width: 7, height: 7, borderRadius: 4, marginRight: 2 },
});
