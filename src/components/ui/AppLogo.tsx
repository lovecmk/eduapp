import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { fontBold } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';

const logos = {
  light: require('../../../assets/icon.png'),
  dark: require('../../../assets/icon-dark.png'),
  dim: require('../../../assets/icon-tinted.png'),
};
const fallback = {
  light: { background: '#008DFF', foreground: '#FFFFFF' },
  dark: { background: '#07132E', foreground: '#259BFF' },
  dim: { background: '#161616', foreground: '#FFFFFF' },
};

interface Props {
  size?: number;
  testID?: string;
}

export function AppLogo({ size = 32, testID }: Props) {
  const { theme } = useTheme();
  const mode = theme.mode;
  const [failedMode, setFailedMode] = useState<typeof mode | null>(null);
  const failed = failedMode === mode;
  return (
    <View testID={testID} accessible={false} style={{ width: size, height: size, flexShrink: 0, borderRadius: size * 0.2, overflow: 'hidden', backgroundColor: fallback[mode].background, alignItems: 'center', justifyContent: 'center' }}>
      {failed ? <Text accessible={false} style={{ color: fallback[mode].foreground, fontFamily: fontBold, fontSize: size * 0.86, lineHeight: size }}>3</Text> : <Image
        key={mode}
        testID={testID ? `${testID}-image` : undefined}
        source={logos[mode]}
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessible={false}
        onError={() => setFailedMode(mode)}
        onLoad={() => setFailedMode(null)}
      />}
    </View>
  );
}
