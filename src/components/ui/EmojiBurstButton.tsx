import React, { useCallback, useRef, useState } from 'react';
import { Pressable, Text, View, Animated, Easing, type ViewStyle } from 'react-native';
import { hapticTap } from '../../utils/haptics';
import { useSafeTimeout } from '../../hooks/useSafeTimeout';
import { useTheme } from '../../theme/ThemeProvider';
import { fontMono } from '../../theme/tokens';

interface Particle {
  id: number;
  anim: Animated.Value;
  dx: number;
  dy: number;
  rot: number;
}

/**
 * 퀵 이모지 리액션 버튼 — 누르면 이모지가 위로 "팡" 터지는 파티클 버스트가 재생된다.
 * 파티클은 버튼 위치를 기준으로 자체 오버레이에 그려져 좌표 계산 없이 안정적으로 동작한다.
 */
export function EmojiBurstButton({
  emoji,
  count,
  active,
  tint,
  onPress,
  style,
}: {
  emoji: string;
  count: number;
  active?: boolean;
  tint?: string;
  onPress: () => void;
  style?: ViewStyle;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const accent = tint ?? c.primary;
  const [particles, setParticles] = useState<Particle[]>([]);
  const idRef = useRef(0);
  const pop = useRef(new Animated.Value(1)).current;
  // 파티클 정리 타이머는 1초 뒤에 돈다. 그 사이 사용자가 화면을 떠나면
  // 사라진 컴포넌트의 setState 가 호출되므로 언마운트 시 함께 정리한다.
  const { run } = useSafeTimeout();

  const burst = useCallback(() => {
    const n = 7;
    const batch: Particle[] = [];
    for (let i = 0; i < n; i++) {
      const anim = new Animated.Value(0);
      // 위쪽(-90°)을 중심으로 부채꼴로 퍼진다.
      const angle = (-90 + (Math.random() * 130 - 65)) * (Math.PI / 180);
      const dist = 40 + Math.random() * 40;
      batch.push({
        id: idRef.current++,
        anim,
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist,
        rot: Math.random() * 80 - 40,
      });
      Animated.timing(anim, {
        toValue: 1,
        duration: 620 + Math.random() * 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }
    setParticles((p) => [...p, ...batch]);
    const ids = new Set(batch.map((b) => b.id));
    run(() => setParticles((p) => p.filter((x) => !ids.has(x.id))), 1000);

    pop.setValue(0.8);
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 4, tension: 120 }).start();
  }, [pop, run]);

  const handle = useCallback(() => {
    hapticTap();
    burst();
    onPress();
  }, [burst, onPress]);

  return (
    <View style={style}>
      {/* 파티클 오버레이 — 버튼 중앙 기준 */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: -6, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
        {particles.map((pt) => {
          const tx = pt.anim.interpolate({ inputRange: [0, 1], outputRange: [0, pt.dx] });
          const ty = pt.anim.interpolate({ inputRange: [0, 1], outputRange: [0, pt.dy] });
          const op = pt.anim.interpolate({ inputRange: [0, 0.65, 1], outputRange: [1, 1, 0] });
          const sc = pt.anim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.5, 1.25, 0.85] });
          return (
            <Animated.Text
              key={pt.id}
              style={{ position: 'absolute', fontSize: 15, opacity: op, transform: [{ translateX: tx }, { translateY: ty }, { scale: sc }, { rotate: `${pt.rot}deg` }] }}
            >
              {emoji}
            </Animated.Text>
          );
        })}
      </View>

      <Pressable onPress={handle} hitSlop={5}>
        <Animated.View
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 3,
            paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
            backgroundColor: active ? accent + '1F' : c.surfaceAlt,
            borderWidth: 1, borderColor: active ? accent + '55' : 'transparent',
            transform: [{ scale: pop }],
          }}
        >
          <Text style={{ fontSize: 13 }}>{emoji}</Text>
          <Text style={{ color: active ? accent : c.textSecondary, fontSize: 11, fontFamily: fontMono, fontWeight: '700' }}>{count}</Text>
        </Animated.View>
      </Pressable>
    </View>
  );
}
