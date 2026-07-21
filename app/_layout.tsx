import 'react-native-gesture-handler';
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Easing } from 'react-native';
import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';

import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider';
import { useAuthStore } from '../src/store/authStore';
import { useSettingsStore } from '../src/store/settingsStore';
import { syncPushTokenWithServer } from '../src/data/notifications/NotificationService';
import { fontDisplay, fontBody } from '../src/theme/tokens';
import { ErrorBoundary } from '../src/components/ui/ErrorBoundary';
import { UpdatePrompt } from '../src/components/ui/UpdatePrompt';
import { useAppUpdate } from '../src/hooks/useAppUpdate';
import { APP_FONTS } from '../src/theme/tokens';
import { applyGlobalFont } from '../src/theme/applyGlobalFont';

applyGlobalFont();

// 네이티브 스플래시(흰 배경 + KFPA 로고)를 앱이 직접 제어한다.
// - preventAutoHide: JS 오버레이가 화면을 완전히 덮기 전에 네이티브 스플래시가
//   스스로 걷히면서 두 로고가 겹쳐 보이던(인트로 2개) 현상을 막는다.
// - fade:false: 네이티브 스플래시를 페이드 없이 즉시 걷어, 아래에서 조용히 사라지게 한다.
SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ fade: false });

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function RootContent() {
  const { theme, isDark } = useTheme();
  const restore = useAuthStore((s) => s.restore);
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const user = useAuthStore((s) => s.user);
  const notificationsEnabled = useSettingsStore((s) => s.notifications.enabled);
  const [splashDone, setSplashDone] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;
  // 인트로 로고의 '안착' 애니메이션 값. 네이티브 스플래시(작은 로고)에서 JS 오버레이로
  // 넘어오는 순간, 로고가 딱 튀며 크기가 바뀌어 '아이콘이 2개'처럼 보이던 현상을 없애기
  // 위해, JS 로고를 네이티브와 비슷한 크기에서 시작해 큰 크기로 부드럽게 이어 키운다.
  const iconScale = useRef(new Animated.Value(0.82)).current;
  // 앱 이름·태그라인은 네이티브 스플래시엔 없으므로, 로고 안착 직후 살짝 떠오르게 한다.
  const textOpacity = useRef(new Animated.Value(0)).current;
  // 앱 폰트와 함께 아이콘 폰트(Ionicons)도 미리 로드해, 첫 렌더에서 아이콘이
  // 비어 보이는(로딩 전 빈 글리프) 현상을 방지한다.
  const [fontsLoaded, fontError] = useFonts({ ...APP_FONTS, ...Ionicons.font });
  const { updateAvailable, remote, apply, dismiss } = useAppUpdate();

  useEffect(() => {
    restore();
  }, []);

  // 로그인 완료 + 알림 On 상태면 원격 푸시 토큰을 서버에 등록/갱신한다.
  // (목업/웹/API 미설정 시에는 내부 가드로 조용히 no-op 처리된다.)
  useEffect(() => {
    if (bootstrapped && user && notificationsEnabled) {
      void syncPushTokenWithServer();
    }
  }, [bootstrapped, user, notificationsEnabled]);

  // 폰트까지 준비되면 네이티브 스플래시를 걷는다. 이 시점 JS 오버레이는 이미
  // 불투명 흰 배경 + 동일한 KFPA 로고로 화면을 덮고 있어, 네이티브 스플래시는
  // 사용자 눈에 띄지 않게 그 아래에서 사라진다(로고가 겹쳐 보이지 않는다).
  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    // 등장 — 네이티브 스플래시에서 이어받아 로고가 '튀지' 않고 큰 크기로 부드럽게
    // 안착하며, 곧이어 앱 이름·태그라인이 서서히 떠오른다. (단일 큰 로고 인트로)
    Animated.parallel([
      Animated.timing(iconScale, {
        toValue: 1,
        duration: 460,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 420,
        delay: 160,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const t = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => setSplashDone(true));
    }, 1100);
    return () => clearTimeout(t);
  }, []);

  const ready = bootstrapped && splashDone && fontsLoaded;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          gestureEnabled: false,
          contentStyle: { backgroundColor: theme.colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ animation: 'fade' }} />
        {/* 로그인 ↔ 홈은 '앱 안으로 진입/이탈'하는 전환이므로, 옆으로 미는(slide)
            대신 부드럽게 교차 페이드시켜 어수선함 없이 자연스럽게 넘어가게 한다. */}
        <Stack.Screen name="(auth)" options={{ animation: 'fade', animationDuration: 280 }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade', animationDuration: 280 }} />
        <Stack.Screen name="contents" />
        <Stack.Screen name="content/[id]" />
        <Stack.Screen name="collection/[type]" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="share" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="trophy" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="edit-profile" />
        {/* 내 QR 명함 — 우선 비활성화(제거). 라우트/코드는 주석으로 보존.
        <Stack.Screen name="qr-card" options={{ animation: 'slide_from_bottom' }} /> */}
        <Stack.Screen name="redeem" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="collection-book" />
        <Stack.Screen name="pack-rules" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="author-card" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="developer" />
        <Stack.Screen name="notifications" options={{ animation: 'slide_from_bottom' }} />
      </Stack>
      {!ready && (
        // 부팅 스플래시 — 네이티브 스플래시(흰 배경 + KFPA 로고, 화면 중앙 200dp)에서
        // '그대로 이어지는' 단 하나의 인트로. 로딩이 끝나면 통째로 페이드아웃되며 앱으로 넘어간다.
        // 라이트/다크 무관하게 동일한 흰 배경 + KFPA 로고로 고정한다.
        <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999, opacity, backgroundColor: '#FFFFFF' }}>
          {/* 로고 — 네이티브 스플래시(작은 로고)에서 시작해 화면 정중앙에서 큰 크기로
              부드럽게 안착한다. 크기가 튀며 '아이콘 2개'처럼 보이던 현상을 없앤다. */}
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View style={{ transform: [{ scale: iconScale }] }}>
              <Image
                source={require('../assets/splash-icon.png')}
                style={{ width: 200, height: 200 }}
                contentFit="contain"
                transition={0}
              />
            </Animated.View>
          </View>
          {/* 앱 이름·태그라인 — 로고 위치를 밀지 않도록 화면 중앙 아래에 절대배치하고,
              로고가 안착한 뒤 서서히 떠오르게 한다. */}
          <Animated.View style={{ position: 'absolute', left: 0, right: 0, top: '50%', marginTop: 116, alignItems: 'center', opacity: textOpacity }}>
            <Text style={{ color: '#1F2937', fontSize: 24, letterSpacing: 2, fontFamily: fontDisplay }}>현장학습</Text>
            <Text style={{ color: '#6B7280', fontSize: 13, marginTop: 8, letterSpacing: 0.3, fontFamily: fontBody }}>하루 3분, 현장 안전 습관</Text>
          </Animated.View>
        </Animated.View>
      )}
      <UpdatePrompt
        visible={ready && updateAvailable}
        remote={remote}
        onUpdate={apply}
        onDismiss={dismiss}
      />
    </View>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <ThemeProvider>
              <RootContent />
            </ThemeProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
