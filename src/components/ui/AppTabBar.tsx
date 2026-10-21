import React, { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring, withSequence } from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeProvider';
import { useAuthStore } from '../../store/authStore';
import { APP_TABS, showAppTabBar } from '../../navigation/tabBar';
import { TabBarButton } from './TabBarButton';

type IconName = keyof typeof Ionicons.glyphMap;

// 탭 선택 시 아이콘이 아주 살짝 커졌다 제자리로 안착하는 절제된 마이크로 인터랙션.
// (과한 바운스 없이 — simple & luxury. 눌렀다는 감만 은은하게 전한다.)
function TabIcon({ icon, color, focused }: { icon: IconName; color: string; focused: boolean }) {
  const scale = useSharedValue(focused ? 1 : 0.94);

  useEffect(() => {
    if (focused) {
      scale.value = withSequence(
        withTiming(1.06, { duration: 110 }),
        withSpring(1, { damping: 18, stiffness: 170 }),
      );
    } else {
      scale.value = withTiming(0.94, { duration: 180 });
    }
  }, [focused]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={style}>
      <Ionicons name={icon} size={24} color={color} />
    </Animated.View>
  );
}

export function AppTabBar() {
  const { theme } = useTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const segments = useSegments() as string[];
  const signedIn = useAuthStore(s => s.bootstrapped && !!s.user);
  const lastTab = useRef('mypage');
  if (segments[0] === '(tabs)') lastTab.current = segments[1] ?? 'index';
  if (!showAppTabBar(segments, signedIn)) return null;

  return (
    <View testID="app-tab-bar" accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: c.surface,
      borderTopWidth: 1, borderTopColor: c.border, height: 64 + insets.bottom, paddingTop: 5, paddingBottom: 6 + insets.bottom }}>
      {APP_TABS.map(tab => {
        const focused = lastTab.current === tab.name;
        return (
          <TabBarButton key={tab.name} accessibilityLabel={tab.label} aria-selected={focused}
            onPress={() => router.navigate(tab.path as never)}>
            <TabIcon icon={focused ? tab.active : tab.inactive} color={focused ? c.primary : c.textSecondary} focused={focused} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: focused ? c.primary : c.textSecondary, marginTop: 3 }}>{tab.label}</Text>
          </TabBarButton>
        );
      })}
    </View>
  );
}
