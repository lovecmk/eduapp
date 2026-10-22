import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { fontBold } from '../../theme/tokens';

interface Props {
  size?: number;
  testID?: string;
}

export function AppLogo({ size = 32, testID }: Props) {
  const [failed, setFailed] = useState(false);
  return (
    <View testID={testID} accessible={false} style={{ width: size, height: size, flexShrink: 0, borderRadius: size * 0.2, overflow: 'hidden', backgroundColor: '#008DFF', alignItems: 'center', justifyContent: 'center' }}>
      {failed ? <Text style={{ color: '#FFFFFF', fontFamily: fontBold, fontSize: size * 0.86, lineHeight: size }}>3</Text> : <Image
        testID={testID ? `${testID}-image` : undefined}
        source={require('../../../assets/icon.png')}
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessible={false}
        onError={() => setFailed(true)}
      />}
    </View>
  );
}
