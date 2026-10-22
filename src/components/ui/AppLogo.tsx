import React from 'react';
import { Image } from 'react-native';

interface Props {
  size?: number;
}

export function AppLogo({ size = 32 }: Props) {
  return (
    <Image
      source={require('../../../assets/icon.png')}
      style={{ width: size, height: size, borderRadius: size * 0.2 }}
      resizeMode="contain"
      accessible={false}
    />
  );
}
