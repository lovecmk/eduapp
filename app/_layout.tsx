import 'react-native-gesture-handler';
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Easing } from 'react-native';
import { Image } from 'expo-image';
import { Stack } from 'expo-router';
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
  // 로고가 은은히 커지며 등장하는 스케일 애니메이션.
  const logoScale = useRef(new Animated.Value(0.86)).current;
  // 앱 폰트와 함께 아이콘 폰트(Ionicons)도 미리 로드해, 첫 렌더에서 아이콘이
  // 비어 보이는(로딩 전 빈 글리프) 현상을 방지한다.
  const [fontsLoaded] = useFonts({ ...APP_FONTS, ...Ionicons.font });
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

  useEffect(() => {
    // 로고 등장(스프링) — 부드럽게 살짝 커지며 자리잡는다.
    Animated.spring(logoScale, { toValue: 1, useNativeDriver: true, friction: 7, tension: 40 }).start();
    const t = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => setSplashDone(true));
    }, 900);
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
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
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
        // 부팅 스플래시 — 화면 정중앙에 로고·앱 이름·로딩 표시를 세로로 배치한 브랜드 로딩 화면.
        // 로딩이 끝나면 통째로 페이드아웃되며 앱으로 넘어간다.
        <Animated.View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', zIndex: 999, opacity, backgroundColor: '#FFFFFF' }}>
          {/* 네이티브 스플래시(흰 배경 + splash-icon.png = KFPA 로고)에서 그대로 이어지도록,
              라이트/다크 무관하게 동일한 흰 배경 + KFPA 로고로 고정해 '하나의 인트로'가 되게 한다. */}
          <Animated.View style={{ alignItems: 'center', transform: [{ scale: logoScale }] }}>
            <Image
              source={require('../assets/splash-icon.png')}
              style={{ width: 200, height: 200 }}
              contentFit="contain"
              transition={0}
            />
            <Text style={{ color: '#1F2937', fontSize: 22, marginTop: 4, letterSpacing: 1, fontFamily: fontDisplay }}>현장학습</Text>
            <Text style={{ color: '#6B7280', fontSize: 13, marginTop: 6, fontFamily: fontBody }}>현장 안전학습, 매일 3분</Text>
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
