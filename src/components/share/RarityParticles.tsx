import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';

/**
 * 희소 등급 별가루 파티클 — 카드 위를 은은하게 반짝이며 떠다닌다.
 * count 개를 황금비 간격으로 흩뿌려 규칙적이지 않게 배치하고 각자 트윙클 루프를 돈다.
 */
export function RarityParticles({
  count,
  width,
  height,
  k,
}: {
  count: number;
  width: number;
  height: number;
  k: number;
}) {
  const parts = useRef(
    Array.from({ length: count }).map((_, i) => ({
      x: 0.06 + 0.88 * ((i * 0.618) % 1),
      y: 0.08 + 0.84 * ((i * 0.322 + 0.15) % 1),
      a: new Animated.Value(0),
      delay: (i * 170) % 1500,
      size: 7 + (i % 3) * 4,
      char: i % 3 === 0 ? '⭐' : '✨',
    })),
  ).current;

  useEffect(() => {
    const anims = parts.map((p) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(p.delay),
          Animated.timing(p.a, { toValue: 1, duration: 1050, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(p.a, { toValue: 0, duration: 1050, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      ),
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [parts]);

  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height }}>
      {parts.map((p, i) => {
        const opacity = p.a.interpolate({ inputRange: [0, 1], outputRange: [0.12, 1] });
        const scale = p.a.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.15] });
        const translateY = p.a.interpolate({ inputRange: [0, 1], outputRange: [5, -7] });
        return (
          <Animated.Text
            key={i}
            style={{
              position: 'absolute', left: p.x * width, top: p.y * height,
              fontSize: p.size * k, opacity,
              transform: [{ scale }, { translateY }],
              textShadowColor: 'rgba(255,255,255,0.7)', textShadowRadius: 6,
            }}
          >
            {p.char}
          </Animated.Text>
        );
      })}
    </View>
  );
}
