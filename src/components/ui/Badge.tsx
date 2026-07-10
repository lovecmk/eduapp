import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { getCategoryColor } from '../../constants/categories';

export function Badge({ label, color }: { label: string; color?: string }) {
  const { theme, fontScale } = useTheme();
  const tint = color ?? getCategoryColor(label) ?? theme.colors.textSecondary;
  return (
    <View style={[styles.chip, { backgroundColor: `${tint}22`, borderColor: tint }]}>
      <Text style={[styles.text, { color: tint, fontSize: 12 * fontScale }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  text: { fontWeight: '700' },
});