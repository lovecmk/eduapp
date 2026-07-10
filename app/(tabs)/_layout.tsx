import React, { useState } from 'react';
import { Text, View, Pressable, ScrollView, Modal } from 'react-native';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/ThemeProvider';
import { OfflineBanner } from '../../src/components/ui/OfflineBanner';
import { BridgeLogo } from '../../src/components/ui/BridgeLogo';
import { useNotificationStore } from '../../src/store/notificationStore';
import { ROUTES } from '../../src/constants/routes';

type IconName = keyof typeof Ionicons.glyphMap;

function TabIcon({ icon, color }: { icon: IconName; color: string }) {
  return <Ionicons name={icon} size={24} color={color} />;
}

function MinimalHeader({ title }: { title: string }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const unreadCount = useNotificationStore((s) => s.unreadCount());

  const items: { label: string; icon: IconName; route: string; activeMatch: string }[] = [
    { label: '알림', icon: 'notifications-outline', route: ROUTES.notifications, activeMatch: '/notifications' },
    { label: '전체 컨텐츠', icon: 'library-outline', route: ROUTES.contents, activeMatch: '/contents' },
    { label: '학습카드', icon: 'school-outline', route: ROUTES.cards, activeMatch: 'cards' },
    { label: '복습', icon: 'refresh-outline', route: ROUTES.review, activeMatch: 'review' },
    { label: '통계', icon: 'stats-chart-outline', route: ROUTES.stats, activeMatch: 'stats' },
    { label: '마이페이지', icon: 'person-circle-outline', route: ROUTES.mypage, activeMatch: 'mypage' },
  ];

  const navigate = (route: string) => {
    setMenuOpen(false);
    router.push(route as any);
  };

  return (
    <>
      <View style={{ height: 58, flexDirection: 'row', alignItems: 'center', backgroundColor: c.bg, borderBottomWidth: 1, borderBottomColor: c.border, paddingHorizontal: 16 }}>
        <Pressable onPress={() => router.push(ROUTES.home as any)}>
          <BridgeLogo size={28} />
        </Pressable>
        <Text style={{ color: c.textPrimary, fontWeight: '700', fontSize: 16, marginLeft: 8, flex: 1 }}>{title}</Text>
        <View style={{ position: 'relative', marginRight: 4 }}>
          <Pressable onPress={() => router.push(ROUTES.notifications as any)} style={{ padding: 6 }}>
            <Ionicons name="notifications-outline" size={24} color={c.textPrimary} />
          </Pressable>
          {unreadCount > 0 && (
            <View style={{ position: 'absolute', top: 2, right: 2, backgroundColor: '#FF3B30', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          )}
        </View>
        <Pressable onPress={() => setMenuOpen(true)} style={{ padding: 6 }}>
          <Ionicons name="menu-outline" size={26} color={c.textPrimary} />
        </Pressable>
      </View>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setMenuOpen(false)}>
          <View style={{ position: 'absolute', top: insets.top + 62, right: 12, backgroundColor: c.surface, borderRadius: 14, paddingVertical: 6, minWidth: 190, borderWidth: 1, borderColor: c.border, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', elevation: 8 }}>
            <ScrollView>
              {items.map((item) => {
                const active = pathname.includes(item.activeMatch);
                return (
                  <Pressable key={item.route} onPress={() => navigate(item.route)}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, backgroundColor: active ? c.surfaceAlt : 'transparent' }}>
                    <Ionicons name={item.icon} size={19} color={active ? c.primary : c.textSecondary} style={{ marginRight: 10 }} />
                    <Text style={{ color: active ? c.primary : c.textPrimary, fontWeight: active ? '700' : '500', fontSize: 14 }}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
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
