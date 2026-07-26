import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontCute } from '../../theme/tokens';

/**
 * 중앙 정렬 모달 공통 셸 — 부드러운 스케일-페이드 인/아웃과 헤더/닫기 버튼을 표준화.
 * 설정 화면의 문의·업데이트 내역 등 다양한 팝업에 재사용한다.
 */
export function CenterModal({
  visible,
  onClose,
  title,
  icon,
  children,
  position = 'center',
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
  /** 'center'(기본) 또는 'bottom' — 하단 시트 형태로 띄워 뒤 화면을 가리지 않게 한다. */
  position?: 'center' | 'bottom';
}) {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  const isBottom = position === 'bottom';
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.92);
  const slide = useSharedValue(40);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
      scale.value = withSpring(1, { damping: 16, stiffness: 200 });
      slide.value = withSpring(0, { damping: 18, stiffness: 200 });
    } else {
      opacity.value = withTiming(0, { duration: 150 });
      scale.value = withTiming(0.92, { duration: 150 });
      slide.value = withTiming(40, { duration: 150 });
    }
  }, [visible]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const cardStyle = useAnimatedStyle(() =>
    isBottom
      ? { opacity: opacity.value, transform: [{ translateY: slide.value }] }
      : { opacity: opacity.value, transform: [{ scale: scale.value }] },
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[styles.overlay, isBottom && styles.overlayBottom, overlayStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="닫기" />
        <Animated.View
          style={[
            styles.card,
            isBottom && styles.cardBottom,
            cardStyle,
            { backgroundColor: c.surface, borderColor: c.border },
          ]}
        >
          {isBottom && <View style={[styles.grabber, { backgroundColor: c.border }]} />}
          <View style={[styles.header, { borderBottomColor: c.border }]}>
            <View style={styles.headerLeft}>
              {icon ? <Ionicons name={icon} size={20} color={c.primary} /> : null}
              <Text style={[styles.title, { color: c.textPrimary, fontSize: 17 * fontScale }]}>
                {title}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={[styles.closeBtn, { backgroundColor: c.surfaceAlt }]}
              accessibilityRole="button" accessibilityLabel="닫기">
              <Ionicons name="close" size={18} color={c.textSecondary} />
            </Pressable>
          </View>
          <ScrollView
            style={{ maxHeight: isBottom ? 420 : 460 }}
            contentContainerStyle={{ padding: 20 }}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 24,
  },
  // 하단 시트: 뒤 화면(학습 카드)을 최대한 덜 가리도록 아래쪽 정렬 + 옅은 딤.
  overlayBottom: {
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.32)',
    padding: 0,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
    elevation: 16,
  },
  cardBottom: {
    maxWidth: 520,
    borderRadius: 24,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
    paddingBottom: 8,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: -2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  title: { fontWeight: '800', fontFamily: fontCute },
  closeBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
