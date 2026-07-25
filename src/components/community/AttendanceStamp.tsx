import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * 캘린더 날짜 칸의 출석 도장(우상단 미니 체크).
 *
 * `animate` 가 true 면 "도장을 꾹 눌러 찍는" 연출을 한 번 재생한다.
 *  · 크게 기울어진 상태로 나타나 → 살짝 지나칠 만큼 작아졌다가 → 제자리(스탬프가 눌리는 느낌)
 *  · 동시에 링이 바깥으로 퍼지며 사라진다(잉크가 번지는 잔향)
 * 이미 찍혀 있던 날짜(과거 출석)는 애니메이션 없이 정적으로 그린다 — 달을 넘길 때마다
 * 지난 도장이 전부 튀면 산만하기 때문이다.
 */
export function AttendanceStamp({ animate = false }: { animate?: boolean }) {
  // 0 → 1 로 진행하는 단일 구동값. 파생 보간으로 scale/rotate/opacity 를 만든다.
  const play = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const ring = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animate) {
      play.setValue(1);
      return;
    }
    play.setValue(0);
    ring.setValue(0);
    const anim = Animated.parallel([
      // 도장이 내려찍히는 느낌 — 빠르게 들어와 살짝 튕긴다.
      Animated.spring(play, { toValue: 1, friction: 4.2, tension: 140, useNativeDriver: true }),
      // 잉크 번짐 링 — 조금 늦게 시작해 부드럽게 퍼지며 사라진다.
      Animated.timing(ring, {
        toValue: 1,
        duration: 520,
        delay: 60,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [animate, play, ring]);

  // 2.2배 크기에서 눌러 내려와 1배로 — '쿵' 찍히는 스탬프 모션.
  const scale = play.interpolate({ inputRange: [0, 1], outputRange: [2.2, 1] });
  const rotate = play.interpolate({ inputRange: [0, 1], outputRange: ['-24deg', '0deg'] });
  const opacity = play.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 1, 1] });

  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [0.4, 2.6] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0.5, 0] });

  return (
    <View style={styles.wrap} pointerEvents="none">
      {animate && (
        <Animated.View style={[styles.ring, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
      )}
      <Animated.View style={[styles.badge, { opacity, transform: [{ scale }, { rotate }] }]}>
        <Ionicons name="checkmark-sharp" size={8} color="#fff" />
      </Animated.View>
    </View>
  );
}

const SIZE = 14;

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: -3, right: -3, width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  badge: {
    width: SIZE, height: SIZE, borderRadius: SIZE / 2,
    backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center',
  },
  ring: {
    position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2,
    borderWidth: 1.5, borderColor: '#22C55E',
  },
});
