import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../theme/ThemeProvider';
import { glassSurface, shadowBox, radius, fontCute } from '../../theme/tokens';
import { Button } from './Button';
import type { RemoteVersion } from '../../data/update/UpdateService';

/**
 * OTA 업데이트 안내 모달 — PART 5.2
 *
 * 새 배포가 감지되면 부드러운 스케일-페이드 인 애니메이션과 함께 나타나
 * 사용자에게 하드 리로드를 유도한다. 강제하지 않고 "나중에"도 허용한다.
 */
export function UpdatePrompt({
  visible,
  remote,
  onUpdate,
  onDismiss,
}: {
  visible: boolean;
  remote: RemoteVersion | null;
  onUpdate: () => void;
  onDismiss: () => void;
}) {
  const { theme, isDark, fontScale } = useTheme();
  const c = theme.colors;
  const glass = isDark ? glassSurface.dark : glassSurface.light;

  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.9);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
      scale.value = withSpring(1, { damping: 15, stiffness: 180 });
    } else {
      opacity.value = withTiming(0, { duration: 160 });
      scale.value = withTiming(0.9, { duration: 160 });
    }
  }, [visible]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  if (!visible) return null;

  return (
    <Animated.View style={[styles.overlay, overlayStyle]} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityLabel="닫기" />
      <Animated.View
        style={[
          styles.card,
          cardStyle,
          { boxShadow: shadowBox(glass.shadow), elevation: 16 },
        ]}
      >
        <BlurView intensity={40} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: c.surface, opacity: isDark ? 0.72 : 0.9 }]} />

        <View style={styles.content}>
          <View style={[styles.iconCircle, { backgroundColor: c.primary + '1A' }]}>
            <Ionicons name="rocket" size={28} color={c.primary} />
          </View>

          <Text style={[styles.title, { color: c.textPrimary, fontSize: 19 * fontScale }]}>
            새로운 버전이 나왔어요
          </Text>
          <Text style={[styles.desc, { color: c.textSecondary, fontSize: 14 * fontScale }]}>
            더 안정적이고 빨라진 최신 버전으로 업데이트할 수 있어요.
            지금 새로고침하면 바로 적용됩니다.
          </Text>

          {remote?.version ? (
            <View style={[styles.versionChip, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
              <Ionicons name="git-branch-outline" size={13} color={c.textSecondary} />
              <Text style={[styles.versionText, { color: c.textSecondary }]}>
                v{remote.version}
                {remote.commit && remote.commit !== 'local' ? ` · ${remote.commit.slice(0, 7)}` : ''}
              </Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <Button label="지금 업데이트" onPress={onUpdate} style={styles.primaryBtn} />
            <Pressable
              onPress={onDismiss}
              accessibilityRole="button"
              hitSlop={8}
              style={styles.laterBtn}
            >
              <Text style={[styles.laterText, { color: c.textSecondary, fontSize: 14 * fontScale }]}>
                나중에
              </Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    padding: 24,
    zIndex: 1000,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    overflow: 'hidden',
  },
  content: { padding: 28, alignItems: 'center' },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: radius.iconCircle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  title: { fontFamily: fontCute, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  desc: { textAlign: 'center', lineHeight: 21, marginBottom: 16 },
  versionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pillButton,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 22,
  },
  versionText: { fontSize: 12, fontWeight: '600' },
  actions: { width: '100%', alignItems: 'center', gap: 4 },
  primaryBtn: { width: '100%' },
  laterBtn: { paddingVertical: 12, paddingHorizontal: 16 },
  laterText: { fontWeight: '600' },
});
