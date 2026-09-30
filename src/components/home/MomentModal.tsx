import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeProvider';
import { useResponsive } from '../../theme/responsive';
import { fontDisplay, fontBody } from '../../theme/tokens';
import type { Moment } from '../../utils/moments';

/**
 * 축하·격려 순간 모달 — 앱을 켠 순간 성취/기념일을 크게 반겨준다.
 * 이모지가 통통 튀고 카드가 스프링으로 등장하는 귀엽고 따뜻한 톤.
 */
export function MomentModal({
  moment,
  onClose,
  onAction,
}: {
  moment: Moment | null;
  onClose: () => void;
  onAction?: () => void;
}) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const { rs } = useResponsive();

  const visible = !!moment;
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.9);
  const emoji = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
      scale.value = withSpring(1, { damping: 13, stiffness: 190 });
      // 이모지: 등장 후 은은히 통통 튀는 반복(귀여운 생동감).
      emoji.value = 0;
      emoji.value = withDelay(
        120,
        withSequence(
          withSpring(1, { damping: 6, stiffness: 160 }),
          withRepeat(withSequence(withTiming(1.08, { duration: 700 }), withTiming(1, { duration: 700 })), -1, true),
        ),
      );
    } else {
      opacity.value = withTiming(0, { duration: 160 });
      scale.value = withTiming(0.9, { duration: 160 });
    }
  }, [visible]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const cardStyle = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  const emojiStyle = useAnimatedStyle(() => ({ transform: [{ scale: emoji.value }] }));

  if (!moment) return null;
  const accent = moment.accent || c.primary;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[styles.overlay, overlayStyle]}>
        <Pressable accessibilityRole="button" style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="닫기" />
        <Animated.View style={[styles.card, cardStyle, { backgroundColor: c.surface, borderColor: c.border }]}>
          {/* 상단 컬러 글로우 */}
          <View style={[styles.glow, { backgroundColor: accent + '22' }]} />
          <View style={[styles.emojiRing, { backgroundColor: accent + '1A', borderColor: accent + '33' }]}>
            <Animated.Text style={[{ fontSize: rs(52) }, emojiStyle]}>{moment.emoji}</Animated.Text>
          </View>

          <Text style={[styles.title, { color: c.textPrimary, fontSize: rs(19) * fs }]}>{moment.title}</Text>
          <Text style={[styles.message, { color: c.textSecondary, fontSize: rs(13.5) * fs, lineHeight: 21 * fs }]}>{moment.message}</Text>

          <View style={{ width: '100%', gap: 8, marginTop: 4 }}>
            {onAction && (
              <Pressable
                onPress={onAction}
                style={[styles.primaryBtn, { backgroundColor: accent }]}
                accessibilityRole="button"
              >
                <Text style={[styles.primaryLabel, { fontSize: rs(14.5) * fs }]}>지금 학습하러 가기</Text>
              </Pressable>
            )}
            <Pressable onPress={onClose} style={styles.ghostBtn} accessibilityRole="button">
              <Text style={[styles.ghostLabel, { color: c.textSecondary, fontSize: rs(13.5) * fs }]}>
                {onAction ? '나중에 할게요' : '고마워요!'}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)', padding: 28 },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 20,
    alignItems: 'center',
    overflow: 'hidden',
    boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
    elevation: 20,
  },
  glow: { position: 'absolute', top: -70, alignSelf: 'center', width: 220, height: 160, borderRadius: 110 },
  emojiRing: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  title: { fontFamily: fontDisplay, fontWeight: '800', textAlign: 'center', marginBottom: 10 },
  message: { fontFamily: fontBody, textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  primaryBtn: { borderRadius: 999, paddingVertical: 13, alignItems: 'center' },
  primaryLabel: { color: '#fff', fontFamily: fontDisplay, fontWeight: '700' },
  ghostBtn: { paddingVertical: 11, alignItems: 'center' },
  ghostLabel: { fontFamily: fontBody },
});
