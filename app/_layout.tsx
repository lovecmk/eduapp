import 'react-native-gesture-handler';
import { AppTabBar } from '../src/components/ui/AppTabBar';
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
import { useCollectionSync } from '../src/hooks/useCollectionSync';
import { useSettingsSync } from '../src/hooks/useSettingsSync';
import { useProgressSync } from '../src/hooks/useProgressSync';
import { useEngagementSync } from '../src/hooks/useEngagementSync';
import { useReportSync } from '../src/hooks/useReportSync';
import { useAuthGuard } from '../src/navigation/authGuard';
import { useReminderSchedule } from '../src/hooks/useReminderSchedule';
import { useFactionSync } from '../src/hooks/useFactionSync';
import { useLocalBackfill } from '../src/hooks/useLocalBackfill';
import { BiometricLockGate } from '../src/components/auth/BiometricLockGate';
import { useNotificationRouting } from '../src/hooks/useNotificationRouting';
import { useNotificationSync } from '../src/hooks/useNotificationSync';
import { useAuthStore } from '../src/store/authStore';
import { useSettingsStore } from '../src/store/settingsStore';
import { syncPushTokenWithServer } from '../src/data/notifications/NotificationService';
import { ErrorBoundary } from '../src/components/ui/ErrorBoundary';
import { UpdatePrompt } from '../src/components/ui/UpdatePrompt';
import { useAppUpdate } from '../src/hooks/useAppUpdate';
import { useAppResume } from '../src/hooks/useAppResume';
import { useAppBackHandler } from '../src/hooks/useAppBackHandler';
import { ToastHost } from '../src/components/ui/ToastHost';
import { MaintenanceGate } from '../src/components/ui/MaintenanceGate';
import { applyWebTypography } from '../src/theme/webTypography';
import { APP_FONTS } from '../src/theme/tokens';
import { applyGlobalFont } from '../src/theme/applyGlobalFont';
import { startQueryLifecycleBridge } from '../src/data/network/queryLifecycle';
import { queryClient } from '../src/data/network/queryClient';
import { DailyWelcomeGate } from '../src/components/home/DailyLearningWelcome';

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

  // 도감(500종 수집·카드팩·조각)을 서버와 맞춘다.
  //
  // 루트에 두는 이유 — 도감 화면은 탭 밖(/collection-book, /pack-rules)에 있고,
  // 팩은 학습 화면에서도 적립된다. 어느 화면에 있든 기록이 남아야 한다.
  useCollectionSync();

  // 계정 설정(관심 분야·하루 목표·알림 수신·공개 범위·한 줄 소개)을 서버와 맞춘다.
  // 루트에 두는 이유는 도감과 같다 — 설정은 여러 화면(설정·프로필·마이페이지)에서
  // 바뀌고, 어디서 바꿨든 같은 계정이면 따라가야 한다.
  useSettingsSync();

  // ── 사용자 데이터 동기화 ──────────────────────────────────────────────
  //
  // 아래 넷은 저장소도 서버 엔드포인트도 완성돼 있었는데 **부르는 코드가
  // 없어서** 오랫동안 죽어 있었다. 그 결과가 운영 DB 에 그대로 남아 있었다 —
  // 어떤 사용자가 이틀에 걸쳐 11장을 학습했는데 srs_state·learn_history·
  // attendance·engagement·reports·notifications 가 전부 0행이었다.
  //
  // 루트에 두는 이유는 도감·설정과 같다. 채점은 학습 화면 여러 곳에서 일어나고
  // 저장·신고는 카드 상세에서 일어난다. 화면마다 호출을 넣으면 언젠가 한 군데가
  // 빠지고, 빠진 자리는 조용히 기록을 잃는다 — 이 기능들이 죽어 있던 것과
  // 똑같은 방식으로. 스토어를 한 곳에서 구독하면 어느 경로로 바뀌든 잡힌다.
  useProgressSync();
  useEngagementSync();
  useReportSync();
  useNotificationSync();
  useNotificationRouting();
  // 내 진영 — 서버가 알아야 진영 대항전을 진영별로 집계한다(서버 미배포면 조용히 기기에만).
  useFactionSync();
  // 서버 라우트가 열리면, 그 전까지 이 기기에만 쌓인 글·팁·투표·질문을 옮긴다.
  useLocalBackfill();

  // 앱 전체 뒤로가기 안전망. 화면별 처리(학습 중 이탈 확인 등)가 우선하고,
  // 아무도 처리하지 않은 뒤로가기만 여기서 받아 앱이 갑자기 종료되는 것을 막는다.
  // 루트에서 먼저 등록해야 화면별 핸들러가 나중에 등록되어 우선순위를 갖는다.
  useAppBackHandler();

  // 세션 없이 보호된 화면에 남지 않게 한다 — 딥링크·웹 새로고침·쓰는 도중의
  // 세션 만료 모두 여기서 로그인 화면으로 모인다(src/navigation/authGuard).
  useAuthGuard();

  // 기기의 학습 리마인더 예약을 지금 사람의 알림 설정에 맞춘다(동기화·로그아웃 포함).
  useReminderSchedule();

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
        <Stack.Screen name="quiz-examples" />
        <Stack.Screen name="share" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="trophy" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="edit-profile" />
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
      <AppTabBar />
      <ToastHost />
      <DailyWelcomeGate enabled={ready && !updateAvailable} />
      <UpdatePrompt
        visible={ready && updateAvailable}
        remote={remote}
        onUpdate={apply}
        onDismiss={dismiss}
      />
      {/* 점검 중이면 모든 화면(로그인 포함) 위를 덮는다 — 점검이라 로그인조차 못 하는
          사람에게도 "왜 안 되는지"는 닿아야 한다. 관리자는 통과한다. */}
      {/* 생체인증 잠금 — 설정에서 켠 사람이 앱을 새로 열었을 때만 덮는다. */}
      <BiometricLockGate />
      <MaintenanceGate />
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
