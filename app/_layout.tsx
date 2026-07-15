import 'react-native-gesture-handler';
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Easing } from 'react-native';
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
import { ErrorBoundary } from '../src/components/ui/ErrorBoundary';
import { UpdatePrompt } from '../src/components/ui/UpdatePrompt';
import { useAppUpdate } from '../src/hooks/useAppUpdate';
import { APP_FONTS, fontDisplay, fontBody } from '../src/theme/tokens';
import { applyGlobalFont } from '../src/theme/applyGlobalFont';

applyGlobalFont();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

/** 부팅 로딩 인디케이터 — 은은하게 순차적으로 깜빡이는 3개 점. */
function LoadingDots({ color }: { color: string }) {
  const dots = [useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.3)).current];
  useEffect(() => {
    const anims = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(d, { toValue: 1, duration: 320, useNativeDriver: true }),
          Animated.timing(d, { toValue: 0.3, duration: 320, useNativeDriver: true }),
          Animated.delay((2 - i) * 160),
        ]),
      ),
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, []);
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginTop: 22 }}>
      {dots.map((d, i) => (
        <Animated.View key={i} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color, opacity: d }} />
      ))}
    </View>
  );
}

function RootContent() {
  const { theme, isDark } = useTheme();
  const restore = useAuthStore((s) => s.restore);
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const [splashDone, setSplashDone] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;
  // 앱 폰트와 함께 아이콘 폰트(Ionicons)도 미리 로드해, 첫 렌더에서 아이콘이
  // 비어 보이는(로딩 전 빈 글리프) 현상을 방지한다.
  const [fontsLoaded] = useFonts({ ...APP_FONTS, ...Ionicons.font });
  const { updateAvailable, remote, apply, dismiss } = useAppUpdate();

  useEffect(() => {
    restore();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => setSplashDone(true));
    }, 650);
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
        <Stack.Screen name="notifications" options={{ animation: 'slide_from_bottom' }} />
      </Stack>
      {!ready && (
        <Animated.View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', zIndex: 999, opacity, backgroundColor: theme.colors.bg }}>
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 96, height: 96, borderRadius: 26, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center', boxShadow: `0 10px 30px ${theme.colors.primary}22` }}>
              <BridgeLogo size={60} />
            </View>
            <Text style={{ color: theme.colors.textPrimary, fontSize: 20, fontFamily: fontDisplay, marginTop: 18, letterSpacing: 1 }}>현장학습</Text>
            <Text style={{ color: theme.colors.textSecondary, fontSize: 12.5, fontFamily: fontBody, marginTop: 4 }}>현장 안전 마이크로러닝</Text>
            <LoadingDots color={theme.colors.primary} />
          </View>
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
