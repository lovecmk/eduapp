// Input (상태별 보더 컬러: Active/Success/Error/Disabled) — PART 2.5
import React, { useState } from 'react';
import { TextInput, View, Text, StyleSheet, type TextInputProps } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, fontCute } from '../../theme/tokens';

type FieldStatus = 'default' | 'success' | 'error' | 'disabled';

export function TextField({
  label,
  status = 'default',
  helperText,
  ...inputProps
}: { label?: string; status?: FieldStatus; helperText?: string } & TextInputProps) {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  const [focused, setFocused] = useState(false);

  const borderColor =
    status === 'success'
      ? c.success
      : status === 'error'
        ? c.error
        : status === 'disabled'
          ? c.border
          : focused
            ? c.primary
            : c.border;

  return (
    <View style={{ marginBottom: 16 }}>
      {label && <Text style={[styles.label, { color: c.textPrimary, fontSize: 13 * fontScale, fontFamily: fontCute }]}>{label}</Text>}
      <TextInput
        {...inputProps}
        editable={status !== 'disabled'}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholderTextColor={c.textSecondary}
        style={[
          styles.input,
          {
            borderColor,
            backgroundColor: status === 'disabled' ? c.surfaceAlt : c.surface,
            color: c.textPrimary,
            fontSize: 15 * fontScale,
            fontFamily: fontCute,
          },
        ]}
      />
      {helperText && (
        <Text style={[styles.helper, { color: status === 'error' ? c.error : c.textSecondary, fontSize: 12 * fontScale, fontFamily: fontCute }]}>
          {helperText}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontWeight: '600', marginBottom: 6 },
  input: { height: 50, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14 },
  helper: { marginTop: 4 },
});
