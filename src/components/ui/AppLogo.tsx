import React from 'react';
import { Image } from 'react-native';

interface Props {
  size?: number;
  testID?: string;
}

export function AppLogo({ size = 32, testID }: Props) {
  return (
    <Image
      testID={testID}
      source={require('../../../assets/icon.png')}
      style={{ width: size, height: size, borderRadius: size * 0.2 }}
      resizeMode="contain"
      accessible={false}
    />
  );
}
