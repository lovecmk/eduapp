import 'react-native-gesture-handler';
import React, { useEffect, useRef, useState } from 'react';
import { View, Animated } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';

import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider';
import { useAuthStore } from '../src/store/authStore';
import { BridgeLogo } from '../src/components/ui/BridgeLogo';
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
  const [splashDone, setSplashDone] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;
  const [fontsLoaded] = useFonts(APP_FONTS);
  const { updateAvailable, remote, apply, dismiss } = useAppUpdate();

  useEffect(() => {
    restore();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => setSplashDone(true));
    }, 300);
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
        <Stack.Screen name="settings" />
        <Stack.Screen name="notifications" options={{ animation: 'slide_from_bottom' }} />
      </Stack>
      {!ready && (
        <Animated.View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', zIndex: 999, opacity, backgroundColor: isDark ? '#000' : '#fff' }}>
          <View style={{ alignItems: 'center' }}>
            <BridgeLogo size={96} />
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
