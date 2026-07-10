import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';

export function SkeletonLoader({ count = 3 }: { count?: number }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const opacity = useRef(new Animated.Value(0.2)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.2, duration: 700, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <View style={{ padding: 20 }}>
      {Array.from({ length: count }).map((_, i) => (
        <Animated.View key={i} style={[styles.row, { opacity, backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
          <View style={[styles.circle, { backgroundColor: c.disabled }]} />
          <View style={{ flex: 1 }}>
            <View style={[styles.line, { width: '70%', backgroundColor: c.disabled }]} />
            <View style={[styles.line, { width: '40%', marginTop: 6, backgroundColor: c.disabled }]} />
          </View>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1 },
  circle: { width: 34, height: 34, borderRadius: 17, marginRight: 12 },
  line: { height: 14, borderRadius: 7 },
});
