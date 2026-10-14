import React, { useCallback, useEffect, useRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** One gesture surface covers both the image and backdrop, on every platform. */
export function ImageViewer({ source, alt, onClose }: {
  source: ImageSourcePropType;
  alt?: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const closing = useRef(false);
  const frame = useRef<number | null>(null);
  const closeAfterTap = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    // On web the gesture ends at pointerup, before the synthetic click. Keep
    // the modal surface alive through that click so it cannot reach the card.
    frame.current = requestAnimationFrame(onClose);
  }, [onClose]);
  useEffect(() => () => { if (frame.current != null) cancelAnimationFrame(frame.current); }, []);
  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const pinch = Gesture.Pinch().withTestId('image-viewer-pinch')
    .onStart(() => { startScale.value = scale.value; })
    .onUpdate(event => { scale.value = Math.min(5, Math.max(1, startScale.value * event.scale)); });
  const pan = Gesture.Pan().withTestId('image-viewer-pan').minDistance(8).averageTouches(true)
    .onStart(() => { startX.value = x.value; startY.value = y.value; })
    .onUpdate(event => {
      if (scale.value > 1) {
        x.value = startX.value + event.translationX;
        y.value = startY.value + event.translationY;
      }
    });
  const tap = Gesture.Tap().withTestId('image-viewer-tap')
    .numberOfTaps(1).maxDuration(250).maxDistance(8)
    .onTouchesDown((event, manager) => { if (event.numberOfTouches > 1) manager.fail(); })
    .onEnd((_event, success) => { if (success) runOnJS(closeAfterTap)(); });
  // A pinch/pan wins the race, so releasing it cannot also dismiss the image.
  const gesture = Gesture.Race(Gesture.Simultaneous(pinch, pan), tap);
  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      {/* Android Modal has a separate native root and needs its own gesture root. */}
      <GestureHandlerRootView style={styles.root}>
        <GestureDetector gesture={gesture}>
          <AnimatedPressable testID="image-viewer-surface" collapsable={false} style={styles.surface}
            onPress={event => event.stopPropagation()}>
            <Animated.View testID="image-viewer-image" pointerEvents="none" style={[StyleSheet.absoluteFill, imageStyle]}>
              <Image source={source} accessibilityLabel={alt ?? '문제 이미지 확대'} style={StyleSheet.absoluteFill} contentFit="contain" />
            </Animated.View>
            <View pointerEvents="none" style={[styles.hint, { bottom: insets.bottom + 20 }]}>
              <Text style={styles.hintText}>핀치로 확대 · 화면을 탭하면 닫혀요</Text>
            </View>
          </AnimatedPressable>
        </GestureDetector>
        <Pressable onPress={event => { event.stopPropagation(); onClose(); }} hitSlop={12} accessibilityRole="button" accessibilityLabel="확대 보기 닫기"
          style={[styles.close, { top: insets.top + 12 }]}>
          <Ionicons name="close" size={24} color="#fff" />
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)' },
  surface: { flex: 1, overflow: 'hidden' },
  close: { position: 'absolute', right: 16, width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  hint: { position: 'absolute', alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  hintText: { color: '#fff', fontSize: 12 },
});
