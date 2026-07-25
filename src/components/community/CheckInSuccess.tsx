import React, { useEffect, useRef } from 'react';
import { Animated, Easing, type ViewStyle, type StyleProp } from 'react-native';

/**
 * '오늘 출석 완료!' 확인 배너.
 *
 * 방금 도장을 찍은 경우(animate)에는 살짝 솟아오르며 나타나 도장 연출과 이어지고,
 * 이미 출석한 상태로 화면에 들어온 경우에는 애니메이션 없이 그대로 보여준다
 * (앱을 열 때마다 배너가 튀어오르면 성가시다).
 */
export function CheckInSuccess({
  animate = false,
  style,
  children,
}: {
  animate?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const enter = useRef(new Animated.Value(animate ? 0 : 1)).current;

  useEffect(() => {
    if (!animate) {
      enter.setValue(1);
      return;
    }
    enter.setValue(0);
    const anim = Animated.timing(enter, {
      toValue: 1,
      duration: 340,
      easing: Easing.out(Easing.back(1.6)),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [animate, enter]);

  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });
  const scale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });

  return (
    <Animated.View style={[style, { opacity: enter, transform: [{ translateY }, { scale }] }]}>
      {children}
    </Animated.View>
  );
}
