import React from 'react';
import { View, TextInput, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontCute } from '../../theme/tokens';

export function SearchBar({
  value, onChange, placeholder = '검색...',
}: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceAlt,
      borderRadius: 14, paddingHorizontal: 14, height: 44, borderWidth: 1, borderColor: c.border,
    }}>
      <Ionicons name="search" size={18} color={c.textSecondary} style={{ marginRight: 8 }} />
      <TextInput
        value={value}
        onChangeText={onChange}
        accessibilityLabel={placeholder}
        placeholder={placeholder}
        placeholderTextColor={c.disabled}
        style={{ flex: 1, minWidth: 0, color: c.textPrimary, fontSize: 14, fontFamily: fontCute, paddingVertical: 0 }}
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChange('')} style={{ padding: 4 }} accessibilityRole="button" accessibilityLabel="검색어 지우기">
          <Ionicons name="close-circle" size={18} color={c.textSecondary} />
        </Pressable>
      )}
    </View>
  );
}
