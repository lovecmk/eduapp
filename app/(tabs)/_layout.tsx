import React, { useState, useEffect } from 'react';
import { Text, View, Pressable } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../src/theme/ThemeProvider';
import { OfflineBanner } from '../../src/components/ui/OfflineBanner';
import { BridgeLogo } from '../../src/components/ui/BridgeLogo';
import { HeaderMenuSheet } from '../../src/components/ui/HeaderMenuSheet';
import { PressableScale } from '../../src/components/ui/PressableScale';
import { Avatar } from '../../src/components/ui/Avatar';
import { useNotificationStore } from '../../src/store/notificationStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { fontDisplay, shadowHeaderBottom } from '../../src/theme/tokens';
import { ROUTES } from '../../src/constants/routes';

type IconName = keyof typeof Ionicons.glyphMap;

// 탭 선택 시 아이콘이 살짝 '통' 튀어오르며 자리잡는 마이크로 인터랙션.
// (선택된 탭만 커졌다가 스프링으로 안착 — 트렌디한 촉감을 더한다.)
function TabIcon({ icon, color, focused }: { icon: IconName; color: string; focused: boolean }) {
  const scale = useSharedValue(focused ? 1 : 0.9);

  useEffect(() => {
    if (focused) {
      scale.value = withSequence(
        withTiming(1.24, { duration: 130 }),
        withSpring(1, { damping: 7, stiffness: 240 }),
      );
    } else {
      scale.value = withTiming(0.9, { duration: 160 });
    }
  }, [focused]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={style}>
      <Ionicons name={icon} size={24} color={color} />
    </Animated.View>
  );
}

// 안 읽은 알림 배지 — 개수가 바뀔 때마다 '톡' 튀며 시선을 끈다.
function NotificationBadge({ count }: { count: number }) {
  const scale = useSharedValue(0);

  useEffect(() => {
    scale.value = withSequence(
      withTiming(1.35, { duration: 140 }),
      withSpring(1, { damping: 6, stiffness: 260 }),
    );
  }, [count]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      style={[
        { position: 'absolute', top: 2, right: 2, backgroundColor: '#FF3B30', borderRadius: 8, minWidth: 15, height: 15, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
        style,
      ]}
    >
      <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{count > 9 ? '9+' : count}</Text>
    </Animated.View>
  );
}

function MinimalHeader({ title }: { title: string }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const unreadCount = useNotificationStore((s) => s.unreadCount());
  const profileImage = useSettingsStore((s) => s.profileImage);

  return (
    <>
      {/* 기존 전체폭 앱바 — 하단에만 살짝 그림자를 얹어 콘텐츠와 분리. */}
      <View style={{ height: 58, flexDirection: 'row', alignItems: 'center', backgroundColor: c.bg, borderBottomWidth: 1, borderBottomColor: c.border, paddingHorizontal: 16, boxShadow: shadowHeaderBottom(theme.shadow), zIndex: 10 }}>
        <Pressable onPress={() => router.push(ROUTES.home as never)} hitSlop={6}>
          <BridgeLogo size={28} />
        </Pressable>
        <Text style={{ color: c.textPrimary, fontSize: 16, marginLeft: 8, flex: 1, fontFamily: fontDisplay }}>{title}</Text>

        {/* 알림 */}
        <PressableScale haptic onPress={() => router.push(ROUTES.notifications as never)} style={{ padding: 6, marginRight: 2 }} hitSlop={4}>
          <Ionicons name="notifications-outline" size={23} color={c.textPrimary} />
          {unreadCount > 0 && <NotificationBadge count={unreadCount} />}
        </PressableScale>

        {/* 메뉴(아바타) */}
        <PressableScale haptic onPress={() => setMenuOpen(true)} hitSlop={4} style={{ marginLeft: 4 }}>
          <Avatar uri={profileImage} size={30} ring={1.5} ringColor={c.border} />
        </PressableScale>
      </View>

      <HeaderMenuSheet visible={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}

const TITLES: Record<string, string> = {
  index: '홈', cards: '학습', review: '복습', community: '커뮤니티', stats: '통계', mypage: 'MY',
};

const TAB_ICON: Record<string, { active: IconName; inactive: IconName }> = {
  index: { active: 'home', inactive: 'home-outline' },
  cards: { active: 'school', inactive: 'school-outline' },
  review: { active: 'refresh-circle', inactive: 'refresh-outline' },
  community: { active: 'people', inactive: 'people-outline' },
  stats: { active: 'bar-chart', inactive: 'bar-chart-outline' },
  mypage: { active: 'person-circle', inactive: 'person-circle-outline' },
};

export default function TabsLayout() {
  const { theme } = useTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: c.bg }}>
      <OfflineBanner />
      <Tabs
      screenOptions={{
        header: ({ route }) => <MinimalHeader title={TITLES[route.name] ?? ''} />,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textSecondary,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border, height: 64, paddingBottom: 6 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: '홈', tabBarIcon: ({ color, focused }) => <TabIcon icon={focused ? TAB_ICON.index.active : TAB_ICON.index.inactive} color={color} focused={focused} /> }} />
      <Tabs.Screen name="cards" options={{ title: '학습', tabBarIcon: ({ color, focused }) => <TabIcon icon={focused ? TAB_ICON.cards.active : TAB_ICON.cards.inactive} color={color} focused={focused} /> }} />
      <Tabs.Screen name="review" options={{ title: '복습', tabBarIcon: ({ color, focused }) => <TabIcon icon={focused ? TAB_ICON.review.active : TAB_ICON.review.inactive} color={color} focused={focused} /> }} />
      <Tabs.Screen name="community" options={{ title: '커뮤니티', tabBarIcon: ({ color, focused }) => <TabIcon icon={focused ? TAB_ICON.community.active : TAB_ICON.community.inactive} color={color} focused={focused} /> }} />
      <Tabs.Screen name="mypage" options={{ title: 'MY', tabBarIcon: ({ color, focused }) => <TabIcon icon={focused ? TAB_ICON.mypage.active : TAB_ICON.mypage.inactive} color={color} focused={focused} /> }} />
      {/* 통계는 하단 탭에서 숨기고 홈 '통계 보기'·헤더 메뉴에서 진입 */}
      <Tabs.Screen name="stats" options={{ href: null }} />
    </Tabs>
    </View>
  );
}
