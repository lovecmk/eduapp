import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';

interface Props {
  progress: number;
  color: string;
  bgColor?: string;
  height?: number;
  animated?: boolean;
}

export function AnimatedProgressBar({ progress, color, bgColor, height = 8, animated = true }: Props) {
  const widthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (animated) {
      Animated.timing(widthAnim, {
        toValue: progress,
        duration: 800,
        useNativeDriver: false,
      }).start();
    } else {
      widthAnim.setValue(progress);
    }
  }, [progress, animated]);

  return (
    <View style={[styles.bg, { height, backgroundColor: bgColor ?? '#E5E7EB' }]}>
      <Animated.View
        style={[
          styles.fill,
          { height, backgroundColor: color, width: widthAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { borderRadius: 99, overflow: 'hidden' },
  fill: { borderRadius: 99 },
});
