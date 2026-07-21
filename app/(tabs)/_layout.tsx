import React, { useState, useEffect } from 'react';
import { Text, View, Pressable } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../src/theme/ThemeProvider';
import { OfflineBanner } from '../../src/components/ui/OfflineBanner';
import { WeatherBackground } from '../../src/components/ui/WeatherBackground';
import { BridgeLogo } from '../../src/components/ui/BridgeLogo';
import { HeaderMenuSheet } from '../../src/components/ui/HeaderMenuSheet';
import { PressableScale } from '../../src/components/ui/PressableScale';
import { Avatar } from '../../src/components/ui/Avatar';
import { useNotificationStore } from '../../src/store/notificationStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { fontDisplay, shadowHeaderBottom } from '../../src/theme/tokens';
import { ROUTES } from '../../src/constants/routes';

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

// 하단 탭 버튼 — Android 기본 '원형 리플'(과하게 퍼지는 물결)을 걷어내고,
// 눌린 순간에만 아이콘이 은은하게 흐려졌다 돌아오는 차분한 피드백으로 바꾼다.
function TabBarButton({ children, style, onPress }: BottomTabBarButtonProps) {
  return (
    <Pressable
      onPress={(e) => onPress?.(e)}
      android_ripple={null}
      style={(state) => [
        style,
        { flex: 1, alignItems: 'center', justifyContent: 'center' },
        state.pressed && { opacity: 0.55 },
      ]}
    >
      {children as React.ReactNode}
    </Pressable>
  );
}

function MinimalHeader({ title, showBack }: { title: string; showBack?: boolean }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const unreadCount = useNotificationStore((s) => s.unreadCount());
  const profileImage = useSettingsStore((s) => s.profileImage);

  // 탭이지만 상세처럼 진입하는 화면(예: 통계는 MY·홈에서 push)은 뒤로가기 버튼을 노출해
  // 어느 플랫폼에서든 '온 곳(예: MY)'으로 자연스럽게 되돌아가게 한다.
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.push(ROUTES.home as never);
  };

  return (
    <>
      {/* 기존 전체폭 앱바 — 하단에만 살짝 그림자를 얹어 콘텐츠와 분리. */}
      <View style={{ height: 58, flexDirection: 'row', alignItems: 'center', backgroundColor: c.bg, borderBottomWidth: 1, borderBottomColor: c.border, paddingHorizontal: 16, boxShadow: shadowHeaderBottom(theme.shadow), zIndex: 10 }}>
        {showBack ? (
          <PressableScale haptic onPress={goBack} hitSlop={6} style={{ paddingRight: 6, marginLeft: -4 }}>
            <Ionicons name="chevron-back" size={26} color={c.textPrimary} />
          </PressableScale>
        ) : (
          <Pressable onPress={() => router.push(ROUTES.home as never)} hitSlop={6}>
            <BridgeLogo size={28} />
          </Pressable>
        )}
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
      {/* 전역 날씨/시간대 배경 — 학습카드(cards)를 제외한 모든 탭 뒤에 은은히 깔린다.
          각 탭 화면 루트를 투명으로 두면 이 배경이 비쳐 보인다(cards 는 불투명 유지). */}
      <WeatherBackground />
      <OfflineBanner />
      <Tabs
      // 뒤로가기 시 '직전에 보던 탭'으로 되돌아가도록 한다(기본값은 항상 첫 탭=홈으로 튕김).
      // 예: MY → 학습 통계 진입 후 뒤로가기 → 다시 MY 로 자연스럽게 복귀.
      backBehavior="history"
      screenOptions={{
        header: ({ route }) => <MinimalHeader title={TITLES[route.name] ?? ''} />,
        // 각 탭 씬 배경을 투명으로 — 뒤의 전역 날씨 배경이 비쳐 보이게 한다.
        sceneStyle: { backgroundColor: 'transparent' },
        // 탭 전환 — 옆으로 미는 과한 이동 대신 잔잔한 교차 페이드로 자연스럽게 넘긴다.
        // 짧은 지속시간으로 반응성은 유지하면서 시선의 피로를 줄인다.
        animation: 'fade',
        transitionSpec: { animation: 'timing', config: { duration: 180 } },
        tabBarButton: (props) => <TabBarButton {...props} />,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textSecondary,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border, height: 64, paddingBottom: 6 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: '홈', tabBarIcon: ({ color, focused }) => <TabIcon icon={focused ? TAB_ICON.index.active : TAB_ICON.index.inactive} color={color} focused={focused} /> }} />
      {/* 학습 탭은 카드(perspective/rotateY 변환 + 큰 콘텐츠)라 교차 페이드 시 잔상이 강하게 남는다.
          이 화면만 페이드를 끄고 즉시 전환해(잔상 원천 제거) 깔끔하게 넘긴다. */}
      <Tabs.Screen name="cards" options={{ title: '학습', animation: 'none', tabBarIcon: ({ color, focused }) => <TabIcon icon={focused ? TAB_ICON.cards.active : TAB_ICON.cards.inactive} color={color} focused={focused} /> }} />
      <Tabs.Screen name="review" options={{ title: '복습', tabBarIcon: ({ color, focused }) => <TabIcon icon={focused ? TAB_ICON.review.active : TAB_ICON.review.inactive} color={color} focused={focused} /> }} />
      <Tabs.Screen name="community" options={{ title: '커뮤니티', tabBarIcon: ({ color, focused }) => <TabIcon icon={focused ? TAB_ICON.community.active : TAB_ICON.community.inactive} color={color} focused={focused} /> }} />
      <Tabs.Screen name="mypage" options={{ title: 'MY', tabBarIcon: ({ color, focused }) => <TabIcon icon={focused ? TAB_ICON.mypage.active : TAB_ICON.mypage.inactive} color={color} focused={focused} /> }} />
      {/* 통계는 하단 탭에서 숨기고 홈 '통계 보기'·MY·헤더 메뉴에서 push 로 진입.
          상세처럼 진입하므로 뒤로가기 버튼을 단 헤더로 교체해 온 곳으로 되돌아가게 한다. */}
      <Tabs.Screen name="stats" options={{ href: null, header: () => <MinimalHeader title={TITLES.stats} showBack /> }} />
    </Tabs>
    </View>
  );
}
