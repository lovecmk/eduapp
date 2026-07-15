import 'react-native-gesture-handler';
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Easing, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';

import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider';
import { useAuthStore } from '../src/store/authStore';
import { BridgeLogo } from '../src/components/ui/BridgeLogo';
import { fontDisplay, fontBody } from '../src/theme/tokens';
import { ErrorBoundary } from '../src/components/ui/ErrorBoundary';
import { UpdatePrompt } from '../src/components/ui/UpdatePrompt';
import { OtaDiagnostics } from '../src/components/dev/OtaDiagnostics';
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
        <Stack.Screen name="developer" />
        <Stack.Screen name="notifications" options={{ animation: 'slide_from_bottom' }} />
      </Stack>
      {!ready && (
        // 부팅 스플래시 — 화면 정중앙에 로고·앱 이름·로딩 표시를 세로로 배치한 브랜드 로딩 화면.
        // 로딩이 끝나면 통째로 페이드아웃되며 앱으로 넘어간다.
        <Animated.View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', zIndex: 999, opacity, backgroundColor: theme.colors.bg }}>
          <Animated.View style={{ alignItems: 'center', transform: [{ scale: logoScale }] }}>
            <View style={{
              width: 108, height: 108, borderRadius: 30, backgroundColor: theme.colors.surface,
              borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 12px 34px ${theme.colors.primary}22`,
            }}>
              <BridgeLogo size={64} />
            </View>
            <Text style={{ color: theme.colors.textPrimary, fontSize: 22, marginTop: 20, letterSpacing: 1, fontFamily: fontDisplay }}>현장학습</Text>
            <Text style={{ color: theme.colors.textSecondary, fontSize: 13, marginTop: 6, fontFamily: fontBody }}>현장 안전학습, 매일 3분</Text>
          </Animated.View>
          <View style={{ position: 'absolute', bottom: 64, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
          </View>
        </Animated.View>
      )}
      <UpdatePrompt
        visible={ready && updateAvailable}
        remote={remote}
        onUpdate={apply}
        onDismiss={dismiss}
      />
      {/* OTA 파이프라인 검증용 진단 오버레이(테스트). 배지가 보이면 OTA 적용 성공. */}
      <OtaDiagnostics />
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
