import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontDisplay } from '../../theme/tokens';
import { CARD_TEXT_SIZE, CARD_TEXT_LINE_HEIGHT } from './cardPresentation';

export function CardSectionChip({ label, color, icon }: {
  label: string;
  color: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const { fontScale: fs } = useTheme();
  return (
    <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '100%', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: color + '33', backgroundColor: color + '12' }}>
      {icon && <Ionicons name={icon} size={14 * fs} color={color} />}
      <Text style={{ color, fontSize: CARD_TEXT_SIZE * fs, lineHeight: CARD_TEXT_LINE_HEIGHT * fs, fontFamily: fontDisplay, flexShrink: 1 }}>{label}</Text>
    </View>
  );
}
