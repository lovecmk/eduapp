import React, { useEffect, useRef } from 'react';
import { Animated, Text, View, Easing, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../theme/ThemeProvider';
import { useToastStore } from '../../store/toastStore';
import { fontCute } from '../../theme/tokens';

/**
 * 토스트 표시기 — 루트에 한 번만 올린다.
 *
 * 화면 아래쪽(탭바 위)에 띄운다. 위쪽은 상태바·헤더와 겹치고, 한 손으로 쥔 폰에서
 * 시선이 가장 자주 머무는 곳은 아래쪽이다.
 *
 * pointerEvents="none" 이 중요하다 — 안내가 떠 있는 동안 그 아래 버튼이 눌리지
 * 않으면, 급히 다음 동작을 하려던 사용자가 "왜 안 눌리지"를 겪는다.
 */
export function ToastHost() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();

  const message = useToastStore((s) => s.message);
  const kind = useToastStore((s) => s.kind);
  const seq = useToastStore((s) => s.seq);
  const durationMs = useToastStore((s) => s.durationMs);
  const hide = useToastStore((s) => s.hide);

  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!message) return;
    if (timer.current) clearTimeout(timer.current);

    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

    timer.current = setTimeout(() => {
      Animated.timing(anim, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) hide();
      });
    }, durationMs);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // seq 를 의존성에 넣어야 같은 문구가 연달아 와도 다시 나타난다.
  }, [message, seq, durationMs, anim, hide]);

  if (!message) return null;

  const accent = kind === 'success' ? c.success : kind === 'warn' ? c.warning : c.textPrimary;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: insets.bottom + 78,
        alignItems: 'center',
        paddingHorizontal: 24,
      }}
    >
      <Animated.View
        style={{
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
          maxWidth: 420,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 16,
          paddingVertical: 11,
          borderRadius: 12,
          backgroundColor: c.surface,
          borderWidth: 1,
          borderColor: c.border,
          ...Platform.select({
            web: { boxShadow: '0 6px 20px rgba(15,23,42,0.16)' },
            default: {
              shadowColor: '#0F172A',
              shadowOpacity: 0.16,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 6 },
              elevation: 6,
            },
          }),
        }}
      >
        <View style={{ width: 3, height: 15, borderRadius: 2, backgroundColor: accent }} />
        <Text
          style={{
            color: c.textPrimary,
            fontSize: 13 * fs,
            fontFamily: fontCute,
            fontWeight: '600',
          }}
        >
          {message}
        </Text>
      </Animated.View>
    </View>
  );
}
