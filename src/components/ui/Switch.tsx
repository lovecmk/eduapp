import React, { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
  Easing,
} from 'react-native-reanimated';
import { hapticSelection } from '../../utils/haptics';
import { useTheme } from '../../theme/ThemeProvider';

const TRACK_W = 48;
const TRACK_H = 28;
const THUMB = 22;
const PAD = 3;

/**
 * 세련된 커스텀 토글 스위치 — 네이티브 Switch 의 플랫폼 편차를 없애고
 * 부드러운 썸 이동 + 트랙 컬러 전환 애니메이션으로 마감 품질을 높인다.
 *
 * label 은 선택이 아니라 사실상 필수다. 이 스위치는 트랙과 썸만 그리므로
 * 안에 읽을 글자가 없다. 옆에 붙은 설명 텍스트는 별개의 요소라 스크린리더가
 * 묶어 주지 않고, 이름을 주지 않으면 그냥 "스위치, 켬"으로만 읽힌다 —
 * 사용자는 **무엇을** 켜고 끄는지 모른 채 토글하게 된다.
 */
export function Switch({
  value,
  onValueChange,
  disabled,
  label,
  hint,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  /** 스크린리더가 읽을 이름 — 보통 옆에 보이는 설정 항목 제목을 그대로 준다. */
  label?: string;
  /** 켜면 무슨 일이 생기는지에 대한 부연(선택). */
  hint?: string;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, {
      duration: 220,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    });
  }, [value]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [c.disabled, c.primary]),
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * (TRACK_W - THUMB - PAD * 2) }],
  }));

  const handlePress = () => {
    if (disabled) return;
    hapticSelection();
    onValueChange(!value);
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ checked: value, disabled }}
      aria-checked={value}
      aria-disabled={disabled}
      hitSlop={8}
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <Animated.View style={[styles.track, trackStyle]}>
        <Animated.View style={[styles.thumb, thumbStyle]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_W,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    padding: PAD,
    justifyContent: 'center',
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: '#FFFFFF',
    boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
    elevation: 2,
  },
});
