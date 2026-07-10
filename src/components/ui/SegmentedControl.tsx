// 세그먼트 컨트롤 (필박스 인디케이터로 통일) — PART 2.1 / 3.4
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';

export function SegmentedControl({
  options,
  selectedIndex,
  onChange,
}: {
  options: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
}) {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  return (
    <View style={[styles.track, { backgroundColor: c.surfaceAlt }]}>
      {options.map((opt, i) => {
        const active = i === selectedIndex;
        return (
          <Pressable
            key={opt}
            accessibilityRole="button"
            onPress={() => onChange(i)}
            style={[styles.segment, active && { backgroundColor: c.primary }]}
          >
            <Text
              style={{
                color: active ? c.textOnPrimary : c.textSecondary,
                fontWeight: '600',
                fontSize: 13 * fontScale,
              }}
            >
              {opt}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: 999, padding: 3 },
  segment: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999 },
});
