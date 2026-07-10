// 설정 한 줄 단위 공통 컴포넌트 — PART 3.4
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';

export function SettingRow({
  label,
  description,
  right,
}: {
  label: string;
  description?: string;
  right?: React.ReactNode;
}) {
  const { theme, fontScale } = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: theme.colors.border }]}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={{ color: theme.colors.textPrimary, fontSize: 15 * fontScale, fontWeight: '600' }}>{label}</Text>
        {description && (
          <Text style={{ color: theme.colors.textSecondary, fontSize: 12 * fontScale, marginTop: 2 }}>
            {description}
          </Text>
        )}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1 },
});
