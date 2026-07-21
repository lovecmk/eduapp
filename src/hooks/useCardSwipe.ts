import { useState, useRef, useCallback } from 'react';
import { Animated, PanResponder, Dimensions } from 'react-native';
import { hapticTap, hapticImpact } from '../utils/haptics';

const SWIPE_THRESHOLD = 100;
const { width: SCREEN_W } = Dimensions.get('window');

export function useCardSwipe(onSwipeComplete: (dir: 'left' | 'right') => void) {
  const [exiting, setExiting] = useState(false);
  const exitingRef = useRef(false);
  const onSwipeCompleteRef = useRef(onSwipeComplete);
  onSwipeCompleteRef.current = onSwipeComplete;

  const translateX = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(1)).current;
  const hapticTriggered = useRef(false);

  const updateExiting = useCallback((val: boolean) => {
    setExiting(val);
    exitingRef.current = val;
  }, []);

  const fireHaptic = useCallback(() => {
    hapticTap();
  }, []);

  const resetPosition = useCallback(() => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 6 }).start();
    Animated.spring(rotate, { toValue: 0, useNativeDriver: true, friction: 6 }).start();
  }, [translateX, rotate]);

  const completeSwipe = useCallback((dir: 'left' | 'right') => {
    if (exitingRef.current) return;
    updateExiting(true);
    fireHaptic();

    const targetX = dir === 'right' ? SCREEN_W + 100 : -SCREEN_W - 100;
    Animated.parallel([
      Animated.timing(translateX, { toValue: targetX, duration: 250, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      onSwipeCompleteRef.current(dir);
      translateX.setValue(0);
      rotate.setValue(0);
      cardOpacity.setValue(1);
      updateExiting(false);
    });
  }, [fireHaptic, translateX, rotate, cardOpacity, updateExiting]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 10 && !exitingRef.current,
      onPanResponderMove: (_, g) => {
        translateX.setValue(g.dx);
        rotate.setValue(Math.max(-0.4, Math.min(0.4, g.dx / 250)));
        if (Math.abs(g.dx) > SWIPE_THRESHOLD && !hapticTriggered.current) {
          hapticTriggered.current = true;
          hapticImpact();
        }
        if (Math.abs(g.dx) <= SWIPE_THRESHOLD) hapticTriggered.current = false;
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx > SWIPE_THRESHOLD) completeSwipe('right');
        else if (g.dx < -SWIPE_THRESHOLD) completeSwipe('left');
        else resetPosition();
        hapticTriggered.current = false;
      },
    })
  ).current;

  const rotation = rotate.interpolate({
    inputRange: [-0.4, 0, 0.4],
    outputRange: ['-10deg', '0deg', '10deg'],
  });

  return {
    panResponder,
    translateX,
    cardOpacity,
    rotation,
    exiting,
    resetPosition,
    fireHaptic,
    completeSwipe,
  };
}
