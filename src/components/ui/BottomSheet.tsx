import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Pressable, Animated, Dimensions } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { shadowBox } from '../../theme/tokens';

export function BottomSheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  const { theme, isDark } = useTheme();
  const c = theme.colors;
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 1, useNativeDriver: true, friction: 9 }).start();
    } else {
      slideAnim.setValue(0);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <Animated.View
        style={[
          styles.wrap,
          {
            // 불투명 표면 — Android 에서 BlurView 가 불안정해 뒤 내용이 비쳐 보이던
            // '디자인 깨짐'을 막기 위해 반투명/블러 대신 solid surface 를 쓴다.
            backgroundColor: c.surface,
            borderColor: c.border,
            boxShadow: shadowBox(theme.shadow),
            elevation: 16,
            transform: [{ translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [Dimensions.get('window').height, 0] }) }],
          },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)' }]} />
        <View style={{ padding: 20, paddingBottom: 32 }}>{children}</View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 100 },
  wrap: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    overflow: 'hidden',
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
});
