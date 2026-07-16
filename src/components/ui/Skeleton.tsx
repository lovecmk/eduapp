import React, { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle, type DimensionValue } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeProvider';

// 스켈레톤 로딩 UI의 기본 단위.
// 콘텐츠가 도착하기 전, 실제 레이아웃과 같은 자리에 회색 블록을 두고 은은하게 맥동(pulse)시켜
// "곧 채워질 자리"임을 알려준다. 웹·iOS·Android 어디서나 동일하게 동작하도록 reanimated 의
// 투명도 애니메이션만 사용한다(그라디언트 의존성 없음).

const DURATION = 850;

/** 스켈레톤 블록 하나(사각형). width/height/radius 로 어떤 자리든 흉내 낼 수 있다. */
export function Skeleton({
  width = '100%',
  height = 14,
  radius = 8,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}) {
  const { theme } = useTheme();
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.85, { duration: DURATION, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.4, { duration: DURATION, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: theme.colors.disabled },
        animStyle,
        style,
      ]}
    />
  );
}

/** 원형 스켈레톤(아바타·아이콘 자리). */
export function SkeletonCircle({ size = 40, style }: { size?: number; style?: ViewStyle }) {
  return <Skeleton width={size} height={size} radius={size / 2} style={style} />;
}

/** 여러 줄의 텍스트 자리. 마지막 줄은 조금 짧게 그려 실제 문단처럼 보이게 한다. */
export function SkeletonText({
  lines = 3,
  lineHeight = 12,
  gap = 8,
  lastWidth = '60%',
  style,
}: {
  lines?: number;
  lineHeight?: number;
  gap?: number;
  lastWidth?: DimensionValue;
  style?: ViewStyle;
}) {
  return (
    <View style={style}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          width={i === lines - 1 && lines > 1 ? lastWidth : '100%'}
          height={lineHeight}
          radius={lineHeight / 2}
          style={{ marginTop: i === 0 ? 0 : gap }}
        />
      ))}
    </View>
  );
}

/** 앱의 Card 와 같은 외형(surface·테두리·라운드)을 가진 스켈레톤 컨테이너. */
export function SkeletonCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 22, borderWidth: 1, padding: 16, marginBottom: 14 },
});
