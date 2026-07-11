import React, { useState } from 'react';
import { Text, View, Pressable, Image } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/ThemeProvider';
import { OfflineBanner } from '../../src/components/ui/OfflineBanner';
import { BridgeLogo } from '../../src/components/ui/BridgeLogo';
import { HeaderMenuSheet } from '../../src/components/ui/HeaderMenuSheet';
import { useNotificationStore } from '../../src/store/notificationStore';
import { useAuthStore } from '../../src/store/authStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { fontDisplay } from '../../src/theme/tokens';
import { ROUTES } from '../../src/constants/routes';

type IconName = keyof typeof Ionicons.glyphMap;

function TabIcon({ icon, color }: { icon: IconName; color: string }) {
  return <Ionicons name={icon} size={24} color={color} />;
}

function MinimalHeader({ title }: { title: string }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const unreadCount = useNotificationStore((s) => s.unreadCount());
  const user = useAuthStore((s) => s.user);
  const profileImage = useSettingsStore((s) => s.profileImage);

  return (
    <>
      <View style={{ height: 58, flexDirection: 'row', alignItems: 'center', backgroundColor: c.bg, borderBottomWidth: 1, borderBottomColor: c.border, paddingHorizontal: 16 }}>
        <Pressable onPress={() => router.push(ROUTES.home as never)} hitSlop={6}>
          <BridgeLogo size={28} />
        </Pressable>
        <Text style={{ color: c.textPrimary, fontSize: 16, marginLeft: 8, flex: 1, fontFamily: fontDisplay }}>{title}</Text>

        {/* 알림 */}
        <Pressable onPress={() => router.push(ROUTES.notifications as never)} style={{ padding: 6, marginRight: 2 }} hitSlop={4}>
          <Ionicons name="notifications-outline" size={23} color={c.textPrimary} />
          {unreadCount > 0 && (
            <View style={{ position: 'absolute', top: 2, right: 2, backgroundColor: '#FF3B30', borderRadius: 8, minWidth: 15, height: 15, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
              <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          )}
        </Pressable>

        {/* 메뉴(아바타) */}
        <Pressable onPress={() => setMenuOpen(true)} hitSlop={4} style={{ marginLeft: 4 }}>
          {profileImage ? (
            <Image source={{ uri: profileImage }} style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: c.border }} />
          ) : (
            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 14, fontFamily: fontDisplay }}>{user?.name?.charAt(0) ?? '현'}</Text>
            </View>
          )}
        </Pressable>
      </View>

      <HeaderMenuSheet visible={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}

const TITLES: Record<string, string> = {
  index: '홈', cards: '학습카드', review: '복습', stats: '통계', mypage: '마이페이지',
};

const TAB_ICON: Record<string, { active: IconName; inactive: IconName }> = {
  index: { active: 'home', inactive: 'home-outline' },
  cards: { active: 'school', inactive: 'school-outline' },
  review: { active: 'refresh-circle', inactive: 'refresh-outline' },
  stats: { active: 'stats-chart', inactive: 'stats-chart-outline' },
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
      <Tabs.Screen name="index" options={{ title: '홈', tabBarIcon: ({ color, focused }) => <TabIcon icon={focused ? TAB_ICON.index.active : TAB_ICON.index.inactive} color={color} /> }} />
      <Tabs.Screen name="cards" options={{ title: '학습카드', tabBarIcon: ({ color, focused }) => <TabIcon icon={focused ? TAB_ICON.cards.active : TAB_ICON.cards.inactive} color={color} /> }} />
      <Tabs.Screen name="review" options={{ title: '복습', tabBarIcon: ({ color, focused }) => <TabIcon icon={focused ? TAB_ICON.review.active : TAB_ICON.review.inactive} color={color} /> }} />
      <Tabs.Screen name="stats" options={{ title: '통계', tabBarIcon: ({ color, focused }) => <TabIcon icon={focused ? TAB_ICON.stats.active : TAB_ICON.stats.inactive} color={color} /> }} />
      <Tabs.Screen name="mypage" options={{ title: '마이페이지', tabBarIcon: ({ color, focused }) => <TabIcon icon={focused ? TAB_ICON.mypage.active : TAB_ICON.mypage.inactive} color={color} /> }} />
    </Tabs>
    </View>
  );
}
