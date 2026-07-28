// 재사용 마이크로 인터랙션: 누르면 살짝 작아졌다가 스프링으로 튀어오르는 Pressable.
// 앱 전반의 아이콘 버튼·칩·아바타 등 작은 터치 타깃에 '말랑한' 촉감을 일관되게 부여한다.
import React from 'react';
import { Pressable, type PressableProps, type ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring } from 'react-native-reanimated';
import { hapticTap } from '../../utils/haptics';

type Props = PressableProps & {
  children: React.ReactNode;
  /** 눌렀을 때 축소 비율(기본 0.9). 더 큰 요소는 0.96 처럼 약하게 준다. */
  activeScale?: number;
  /** 손끝이 닿는 순간 가벼운 촉감을 줄지(기본 off). 아이콘·아바타 등 '조작'에만 켠다. */
  haptic?: boolean;
  style?: ViewStyle;
};

export function PressableScale({ children, activeScale = 0.9, haptic = false, style, onPressIn, onPressOut, ...rest }: Props) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={animatedStyle}>
      <Pressable accessibilityRole="button"
        {...rest}
        onPressIn={(e) => {
          scale.value = withTiming(activeScale, { duration: 90 });
          if (haptic) hapticTap();
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          scale.value = withSpring(1, { damping: 8, stiffness: 260 });
          onPressOut?.(e);
        }}
        style={style}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
