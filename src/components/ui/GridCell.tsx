// 스텝 그리드 셀 (학습 달력 등 격자+선택 상태) — PART 2.7
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';

type CellState = 'empty' | 'filled' | 'selectedColumn';

export function GridCell({ state, label }: { state: CellState; label?: string }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const style =
    state === 'filled'
      ? { backgroundColor: c.primary }
      : state === 'selectedColumn'
        ? { backgroundColor: 'transparent', borderWidth: 2, borderColor: c.primary }
        : { backgroundColor: c.surfaceAlt };

  return (
    <View style={[styles.cell, style]}>
      {label && (
        <Text style={{ color: state === 'filled' ? c.textOnPrimary : c.textSecondary, fontSize: 11, fontWeight: '600' }}>
          {label}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cell: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
