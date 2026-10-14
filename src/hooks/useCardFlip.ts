import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';

export const FLIP_DURATION_MS = 360;

/** Every tap changes the latest target, even before React commits a render. */
export function useCardFlip(cardKey: string) {
  const progress = useRef(new Animated.Value(0)).current;
  const target = useRef(false);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [backControls, setBackControls] = useState(false);
  const [animating, setAnimating] = useState(false);

  const cancel = useCallback(() => {
    generation.current += 1;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    progress.stopAnimation();
  }, [progress]);

  const reset = useCallback(() => {
    cancel();
    target.current = false;
    progress.setValue(0);
    setFlipped(false);
    setBackControls(false);
    setAnimating(false);
  }, [cancel, progress]);

  const toggle = useCallback(() => {
    const next = !target.current;
    cancel();
    const id = generation.current;
    target.current = next;
    setFlipped(next);
    setAnimating(true);
    timer.current = setTimeout(() => {
      if (generation.current === id) setBackControls(next);
    }, FLIP_DURATION_MS * 0.48);
    Animated.timing(progress, {
      toValue: next ? 1 : 0,
      duration: FLIP_DURATION_MS,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (generation.current === id) {
        if (finished) setBackControls(next);
        setAnimating(false);
      }
    });
    return next;
  }, [cancel, progress]);

  useEffect(() => { reset(); return cancel; }, [cardKey, reset, cancel]);
  return { progress, flipped, backControls, animating, target, toggle, reset };
}
