import React, { useEffect, useState } from 'react';
import { View, Pressable, Modal, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, interpolate, runOnJS, Easing,
} from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * 하단 시트 공통 셸 — 배경 페이드와 시트 슬라이드가 함께(진입/이탈 모두) 움직여
 * 오버레이가 툭 나타나던 어색함을 없앤다. 닫힘 애니메이션까지 완료 후 언마운트.
 */
export function AnimatedSheet({
  visible, onClose, children, rounded = 24,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  rounded?: number;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) });
    } else if (mounted) {
      progress.value = withTiming(0, { duration: 220, easing: Easing.in(Easing.cubic) }, (fin) => {
        if (fin) runOnJS(setMounted)(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: interpolate(progress.value, [0, 1], [340, 0]) }],
  }));

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <View style={styles.anchor} pointerEvents="box-none">
          <Animated.View style={[
            { backgroundColor: c.bg, borderColor: c.border, borderTopLeftRadius: rounded, borderTopRightRadius: rounded, borderWidth: 1, paddingTop: 10, paddingBottom: 20 },
            sheetStyle,
          ]}>
            <View style={[styles.handle, { backgroundColor: c.border }]} />
            {children}
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  anchor: { flex: 1, justifyContent: 'flex-end' },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
});
