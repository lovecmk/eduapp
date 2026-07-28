import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';

import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider';
import { useAuthStore } from '../src/store/authStore';
import { useSettingsStore } from '../src/store/settingsStore';
import { syncPushTokenWithServer } from '../src/data/notifications/NotificationService';
import { ErrorBoundary } from '../src/components/ui/ErrorBoundary';
import { UpdatePrompt } from '../src/components/ui/UpdatePrompt';
import { useAppUpdate } from '../src/hooks/useAppUpdate';
import { useAppResume } from '../src/hooks/useAppResume';
import { useAppBackHandler } from '../src/hooks/useAppBackHandler';
import { ToastHost } from '../src/components/ui/ToastHost';
import { applyWebTypography } from '../src/theme/webTypography';
import { APP_FONTS } from '../src/theme/tokens';
import { applyGlobalFont } from '../src/theme/applyGlobalFont';
import { startQueryLifecycleBridge } from '../src/data/network/queryLifecycle';
import { queryClient } from '../src/data/network/queryClient';

applyGlobalFont();

// 인트로는 '네이티브 스플래시(흰 배경 + KFPA 로고) 하나'만 쓴다.
// - preventAutoHide: 앱이 준비될 때까지(폰트+세션복구) 네이티브 스플래시를 유지했다가
//   직접 걷는다. 별도 JS 부팅 스플래시를 두지 않아 '인트로 2개'로 보이지 않는다.
// - fade:true: 준비되면 부드럽게 페이드아웃되며 앱으로 넘어간다.
SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ fade: true, duration: 300 });

// 캐시는 세션에 종속된 데이터라 로그아웃·계정 전환 때 함께 비워져야 한다.
// 그래서 클라이언트는 화면이 아니라 data/network 에 두고, 비우는 책임은
// store/sessionScope 한 곳이 진다(app/_layout 은 주입만 한다).

function RootContent() {
  const { theme, isDark } = useTheme();
  const restore = useAuthStore((s) => s.restore);
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const user = useAuthStore((s) => s.user);
  const notificationsEnabled = useSettingsStore((s) => s.notifications.enabled);
  // 앱 폰트와 함께 아이콘 폰트(Ionicons)도 미리 로드해, 첫 렌더에서 아이콘이
  // 비어 보이는(로딩 전 빈 글리프) 현상을 방지한다.
  const [fontsLoaded, fontError] = useFonts({ ...APP_FONTS, ...Ionicons.font });
  const { updateAvailable, remote, apply, dismiss } = useAppUpdate();
  // 백그라운드에 오래 있다 돌아오거나 자정을 넘겼을 때 '오늘' 데이터를 갱신한다.
  useAppResume();

  // react-query 에 '지금 화면을 보고 있는가 / 온라인인가'를 알려 준다.
  // 연결하지 않으면 주기 갱신(커뮤니티 15초)이 백그라운드에서도 계속 돈다.
  useEffect(() => startQueryLifecycleBridge(), []);

  useEffect(() => {
    void restore();
  }, [restore]);

  // 웹에서만 한글이 단어 중간에서 잘리는 문제를 전역 스타일로 교정(네이티브는 no-op).
  useEffect(() => {
    applyWebTypography();
  }, []);

  // 로그인 완료 + 알림 On 상태면 원격 푸시 토큰을 서버에 등록/갱신한다.
  // (목업/웹/API 미설정 시에는 내부 가드로 조용히 no-op 처리된다.)
  useEffect(() => {
    if (bootstrapped && user && notificationsEnabled) {
      void syncPushTokenWithServer();
    }
  }, [bootstrapped, user, notificationsEnabled]);

  const ready = (fontsLoaded || !!fontError) && bootstrapped;

  // 인트로는 '네이티브 스플래시(흰 배경 + KFPA 로고) 하나'만 사용한다.
  // 폰트 로드 + 세션 복구가 끝나면(ready) 네이티브 스플래시를 걷어 곧장 앱으로 넘어간다.
  // (기존의 JS 부팅 스플래시 오버레이는 네이티브 스플래시와 겹쳐 '인트로 2개'로 보였고,
  //  로고 크기 점프·글자 잘림 문제가 있어 제거했다.)
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  // 앱 전체 뒤로가기 안전망. 화면별 처리(학습 중 이탈 확인 등)가 우선하고,
  // 아무도 처리하지 않은 뒤로가기만 여기서 받아 앱이 갑자기 종료되는 것을 막는다.
  // 루트에서 먼저 등록해야 화면별 핸들러가 나중에 등록되어 우선순위를 갖는다.
  useAppBackHandler();

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
        {/* 회원가입 직후 진영 선택 — 뒤로가기로 되돌아가지 않도록 페이드로 진입. */}
        <Stack.Screen name="faction-select" options={{ animation: 'fade', animationDuration: 280 }} />
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
        <Stack.Screen name="user-search" />
        <Stack.Screen name="u/[id]" />
        <Stack.Screen name="privacy" />
        <Stack.Screen name="legal" />
      </Stack>
      <ToastHost />
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
