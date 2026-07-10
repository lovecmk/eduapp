import React from 'react';
import { View, Text } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';

interface Props {
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_MAP = {
  sm: { main: 16, sub: 11 },
  md: { main: 22, sub: 14 },
  lg: { main: 32, sub: 18 },
};

export function BrandWordmark({ size = 'md' }: Props) {
  const { theme } = useTheme();
  const c = theme.colors;
  const s = SIZE_MAP[size];

  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
      <Text style={{ fontSize: s.main, fontFamily: 'Jua-Regular', color: c.textPrimary, letterSpacing: 3 }}>BRIDG</Text>
      <Text style={{ fontSize: s.main, fontFamily: 'Jua-Regular', color: c.primary, letterSpacing: 3 }}>E</Text>
      <Text style={{ fontSize: s.sub, fontFamily: 'Jua-Regular', color: c.primary, letterSpacing: 1 }}>- Learning</Text>
    </View>
  );
}
