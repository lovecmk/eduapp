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
import { NoticeBanner } from '../../src/components/ui/NoticeBanner';
import { WeatherBackground } from '../../src/components/ui/WeatherBackground';
import { AppLogo } from '../../src/components/ui/AppLogo';
import { HeaderMenuSheet } from '../../src/components/ui/HeaderMenuSheet';
import { PressableScale } from '../../src/components/ui/PressableScale';
import { Avatar } from '../../src/components/ui/Avatar';
import { useNotificationStore } from '../../src/store/notificationStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { useAuthStore } from '../../src/store/authStore';
import { fontDisplay, shadowHeaderBottom } from '../../src/theme/tokens';
import { ROUTES } from '../../src/constants/routes';
import { APP_NAME } from '../../src/constants/brand';

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
function MinimalHeader({ title, showBack, showSettings = false }: { title: string; showBack?: boolean; showSettings?: boolean }) {
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
          <PressableScale haptic onPress={goBack} hitSlop={6} style={{ paddingRight: 6, marginLeft: -4 }}
            accessibilityRole="button" accessibilityLabel="뒤로 가기">
            <Ionicons name="chevron-back" size={26} color={c.textPrimary} />
          </PressableScale>
        ) : (
          <Pressable onPress={() => router.push(ROUTES.home as never)} hitSlop={6}
            accessibilityRole="button" accessibilityLabel="홈으로">
            <AppLogo size={30} testID="appbar-logo-3" />
          </Pressable>
        )}
        <Text style={{ color: c.textPrimary, fontSize: 16, marginLeft: 8, flex: 1, fontFamily: fontDisplay }}>{title}</Text>

        {/* 알림 */}
        {/* 아이콘만 있는 버튼은 스크린리더가 읽을 텍스트가 없다. 안 읽은 개수까지 라벨에 담는다. */}
        <PressableScale haptic onPress={() => router.push(ROUTES.notifications as never)} style={{ padding: 6, marginRight: 2 }} hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={unreadCount > 0 ? `알림, 안 읽은 알림 ${unreadCount}개` : '알림'}>
          <Ionicons name="notifications-outline" size={23} color={c.textPrimary} />
          {unreadCount > 0 && <NotificationBadge count={unreadCount} />}
        </PressableScale>

        {/* MY는 설정으로 바로 이동하고, 나머지 탭은 프로필 메뉴를 연다. */}
        <PressableScale haptic onPress={() => showSettings ? router.push(ROUTES.settings) : setMenuOpen(true)} hitSlop={4} style={{ marginLeft: 4, width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}
          accessibilityRole="button" accessibilityLabel={showSettings ? '설정 열기' : '내 메뉴 열기'}>
          {showSettings
            ? <Ionicons name="settings-outline" size={25} color={c.textPrimary} />
            : <Avatar uri={profileImage} size={30} ring={1.5} ringColor={c.border} />}
        </PressableScale>
      </View>

      <HeaderMenuSheet visible={menuOpen && !showSettings} onClose={() => setMenuOpen(false)} />
    </>
  );
}

const TITLES: Record<string, string> = {
  index: APP_NAME, cards: '학습', review: '복습', community: '커뮤니티', stats: '통계', mypage: 'MY',
};

export default function TabsLayout() {
  const { theme } = useTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  // 세션이 없으면 탭을 그리지 않는다 — 루트의 인증 가드가 로그인으로 보낼 때까지 한 박자
  // 동안이라도 탭이 마운트되면, 각 화면의 쿼리가 토큰 없이 서버로 나간다(웹에서 /cards 를
  // 로그아웃 상태로 열면 오늘의 학습·설정 요청이 401 로 줄줄이 떨어지는 것이 보였다).
  const signedOut = useAuthStore((s) => s.bootstrapped && !s.user);
  if (signedOut) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  return (
    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: c.bg }}>
      {/* 전역 날씨/시간대 배경 — 학습카드(cards)를 제외한 모든 탭 뒤에 은은히 깔린다.
          각 탭 화면 루트를 투명으로 두면 이 배경이 비쳐 보인다(cards 는 불투명 유지). */}
      <WeatherBackground />
      {/* 화면 맨 위 한 줄이 '지금 알아야 할 것'을 맡는다.
          연결 상태가 먼저 오는 이유 — 오프라인이면 공지 자체가 옛것일 수 있다. */}
      <OfflineBanner />
      <NoticeBanner />
      <Tabs
      // 뒤로가기 시 '직전에 보던 탭'으로 되돌아가도록 한다(기본값은 항상 첫 탭=홈으로 튕김).
      // 예: MY → 학습 통계 진입 후 뒤로가기 → 다시 MY 로 자연스럽게 복귀.
      backBehavior="history"
      tabBar={() => null}
      screenOptions={{
        header: ({ route }) => <MinimalHeader title={TITLES[route.name] ?? ''} showSettings={route.name === 'mypage'} />,
        // 각 탭 씬 배경을 투명으로 — 뒤의 전역 날씨 배경이 비쳐 보이게 한다.
        sceneStyle: { backgroundColor: 'transparent' },
        // 비활성 탭은 얼려(freeze) 렌더를 멈춘다 — 전환 중 이전 화면이 계속 그려지며
        // 이미지가 겹쳐 보이거나 그림자 잔상이 남는 현상을 줄인다.
        freezeOnBlur: true,
        // 탭 전환 — 잔잔한 교차 페이드. 지속시간을 더 짧게 잡아 두 화면이 겹치는 구간을 줄인다.
        animation: 'fade',
        transitionSpec: { animation: 'timing', config: { duration: 130 } },
      }}
    >
      <Tabs.Screen name="index" options={{ title: '홈' }} />
      {/* 학습 탭은 카드(perspective/rotateY 변환 + 큰 콘텐츠)라 교차 페이드 시 잔상이 강하게 남는다.
          이 화면만 페이드를 끄고 즉시 전환해(잔상 원천 제거) 깔끔하게 넘긴다. */}
      <Tabs.Screen name="cards" options={{ title: '학습', animation: 'none' }} />
      <Tabs.Screen name="review" options={{ title: '복습' }} />
      <Tabs.Screen name="community" options={{ title: '커뮤니티' }} />
      <Tabs.Screen name="mypage" options={{ title: 'MY' }} />
      {/* 통계는 하단 탭에서 숨기고 홈 '통계 보기'·MY·헤더 메뉴에서 push 로 진입.
          상세처럼 진입하므로 뒤로가기 버튼을 단 헤더로 교체해 온 곳으로 되돌아가게 한다. */}
      <Tabs.Screen name="stats" options={{ href: null, header: () => <MinimalHeader title={TITLES.stats} showBack /> }} />
    </Tabs>
    </View>
  );
}
