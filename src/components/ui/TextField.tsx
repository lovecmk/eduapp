// Input (상태별 보더 컬러: Active/Success/Error/Disabled) — PART 2.5
import React, { useState } from 'react';
import { TextInput, View, Text, StyleSheet, type TextInputProps } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { fontBody, fontDisplay } from '../../theme/tokens';

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
      {label && <Text style={[styles.label, { color: c.textPrimary, fontSize: 13 * fontScale, fontFamily: fontDisplay }]}>{label}</Text>}
      <TextInput
        {...inputProps}
        // 보이는 라벨을 입력에도 이름으로 준다. 라벨은 별개의 <Text> 라
        // 스크린리더가 묶어 주지 않아, 그냥 두면 "텍스트 입력"으로만 읽힌다.
        // 호출부가 직접 준 accessibilityLabel 이 있으면 그쪽을 존중한다.
        accessibilityLabel={inputProps.accessibilityLabel ?? label}
        // 오류 문구는 왜 막혔는지를 설명하므로 힌트로 함께 읽어 준다.
        accessibilityHint={inputProps.accessibilityHint ?? (status === 'error' ? helperText : undefined)}
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
            fontFamily: fontBody,
          },
        ]}
      />
      {helperText && (
        <Text style={[styles.helper, { color: status === 'error' ? c.error : c.textSecondary, fontSize: 12 * fontScale, fontFamily: fontBody }]}>
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
