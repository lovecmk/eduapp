import React, { useCallback, useRef, useState } from 'react';
import { View, Text, ScrollView, Platform, Pressable, Modal, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../src/theme/ThemeProvider';
import { useSettingsStore, type ThemeMode, type FontScale } from '../src/store/settingsStore';
import { useAuthStore } from '../src/store/authStore';
import { resetAllLocalData } from '../src/store/resetAppData';
import { clearSessionOwner } from '../src/store/sessionScope';
import { SegmentedControl } from '../src/components/ui/SegmentedControl';
import { Switch } from '../src/components/ui/Switch';
import { Button } from '../src/components/ui/Button';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { SettingsGroup, SettingsItem } from '../src/components/ui/SettingsGroup';
import { AMBIENT_THEME_OPTIONS } from '../src/constants/ambient';
import { MembershipCard } from '../src/components/settings/MembershipCard';
import { SupportModal } from '../src/components/settings/SupportModal';
import { ChangelogModal } from '../src/components/settings/ChangelogModal';
import { useSettingsSearch, SettingsSearchBar, SettingsSearchResults } from '../src/components/settings/SettingsSearch';
import { SettingsFocusProvider, FocusAnchor, MeasureOffset, useSettingsFocus } from '../src/components/settings/SettingsFocus';
import { CenterModal } from '../src/components/ui/CenterModal';
import { fontMono, fontCute, fontDisplay } from '../src/theme/tokens';
import { INTEREST_FIELDS, INTEREST_COLOR, INTEREST_ICON } from '../src/constants/interests';
import { env } from '../src/data/network/env';
import { clearQueue } from '../src/data/network/offlineQueue';
import { ROUTES } from '../src/constants/routes';
import { downloadSystemLog } from '../src/utils/downloadLog';
import { hapticSelection } from '../src/utils/haptics';
import type { SettingsEntry } from '../src/constants/settingsIndex';
import {
  requestNotificationPermission,
  cancelAllReminders,
  syncPushTokenWithServer,
} from '../src/data/notifications/NotificationService';
import { APP_NAME } from '../src/constants/brand';
import { contentColumn } from '../src/theme/layout';
import { displayName } from '../src/domain/models/User';
import { isBiometricAvailable, authenticateWithBiometrics } from '../src/data/auth/BiometricAuth';
import { toast } from '../src/store/toastStore';

const THEME_OPTIONS: ThemeMode[] = ['light', 'dark', 'dim', 'system'];
const THEME_LABELS = ['라이트', '다크', '딤', '시스템'];
const FONT_OPTIONS: FontScale[] = ['xsmall', 'small', 'medium', 'large', 'xlarge'];
const FONT_LABELS = ['XS', 'S', 'M', 'L', 'XL'];

/**
 * 설정 화면 — 원칙 세 가지.
 *  1) 얕게: 설정 본문에서 최대 한 단계(상세 화면)까지만 들어간다. 토글·선택은 전부 여기서 끝낸다.
 *  2) 간결하게: 그룹은 7개로 고정하고, 성격이 겹치던 항목(프로필·계정, 커뮤니티·수집)은 합쳤다.
 *  3) 대신 검색으로: 구조를 몰라도 이름·초성으로 어떤 depth 의 항목이든 바로 도달한다
 *     (`src/constants/settingsIndex.ts` 색인 → 다른 화면의 항목이면 `?focus=` 로 이동·하이라이트).
 */
export default function SettingsScreen() {
  const { theme } = useTheme();
  const c = theme.colors;
  const params = useLocalSearchParams<{ focus?: string }>();
  const focusId = typeof params.focus === 'string' ? params.focus : null;
  const scrollRef = useRef<ScrollView>(null);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title="설정" />
      <SettingsFocusProvider scrollRef={scrollRef} initialFocusId={focusId} offset={28}>
        <SettingsBody scrollRef={scrollRef} />
      </SettingsFocusProvider>
    </View>
  );
}

function SettingsBody({ scrollRef }: { scrollRef: React.RefObject<ScrollView> }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { focus } = useSettingsFocus();

  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const {
    themeMode, fontScale: fontScaleSetting, highContrast,
    notifications, biometricLoginEnabled, shuffleCards, keepScreenOn, offlineMode,
    prioritizeWeakSpots, dontKnowHaptic, showAchievementBadge, collectionEnabled,
    setThemeMode, setFontScale, toggleHighContrast,
    updateNotificationSetting, setBiometricLogin,
    toggleShuffleCards, toggleKeepScreenOn, toggleOfflineMode, togglePrioritizeWeakSpots,
    toggleDontKnowHaptic, toggleAchievementBadge, toggleCollectionEnabled, resetAll,
    ambientTheme, setAmbientTheme, pushRecentSetting,
  } = useSettingsStore();

  const search = useSettingsSearch(collectionEnabled);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const profileImage = useSettingsStore((s) => s.profileImage);
  const interests = useSettingsStore((s) => s.interests);
  const toggleInterest = useSettingsStore((s) => s.toggleInterest);

  const [h, m] = notifications.dailyReminderTime.split(':').map(Number);
  const [editH, setEditH] = useState(h);
  const [editM, setEditM] = useState(m);

  const openTimePicker = useCallback(() => {
    const [ch, cm] = notifications.dailyReminderTime.split(':').map(Number);
    setEditH(ch); setEditM(cm);
    setTimePickerOpen(true);
  }, [notifications.dailyReminderTime]);

  // OS 알림 API 는 기기·권한 상태에 따라 예외를 던진다(웹, 권한 거부, 시뮬레이터 등).
  // 예전엔 이걸 감싸지 않아서, 실패하면 모달이 닫히지 않거나 스위치가 그대로 남아
  // "눌렀는데 아무 일도 안 일어난다"로 보였다. 예약은 실패해도 설정 자체는 저장한다.
  // 기기 예약은 여기서 걸지 않는다 — 값만 바꾸면 루트의 useReminderSchedule 이 맞춘다.
  // (다른 기기에서 바꾼 값·로그아웃도 같은 길로 반영되게 한 곳에 모았다.)
  const saveTime = () => {
    const t = `${String(editH).padStart(2, '0')}:${String(editM).padStart(2, '0')}`;
    updateNotificationSetting('dailyReminderTime', t);
    setTimePickerOpen(false);
  };

  const onToggleNotification = async (enabled: boolean) => {
    if (enabled) {
      let granted = false;
      try { granted = await requestNotificationPermission(); } catch { granted = false; }
      if (!granted && Platform.OS !== 'web') {
        // 거절당하면 스위치는 그대로 꺼져 있다. 이유를 말하지 않으면 '눌러도 안 켜진다'로 읽힌다.
        toast('알림 권한이 꺼져 있어요. 기기 설정에서 알림을 허용해 주세요.', 'warn', 3200);
        return;
      }
      // 실서버 사용 시 원격 푸시 토큰도 함께 등록(서버·텔레그램 알림 수신용).
      void syncPushTokenWithServer();
    }
    // 예약·해제는 루트의 useReminderSchedule 이 이 값을 보고 한다.
    updateNotificationSetting('enabled', enabled);
  };

  /**
   * 생체인증 잠금 켜기/끄기.
   *
   * 켤 때는 **지금 한 번 확인한다.** 지문이 등록되지 않은 기기에서 켜 두면 다음 실행에
   * 잠금 화면만 뜨고 열 방법이 없다. 확인을 통과해야 켜지고, 이 실행은 이미 연 것으로 친다.
   */
  const onToggleBiometric = async (enabled: boolean) => {
    if (!enabled) { setBiometricLogin(false); return; }
    if (!(await isBiometricAvailable())) {
      toast('이 기기에서는 생체인증을 쓸 수 없어요. 기기 설정에서 지문·얼굴을 먼저 등록해 주세요.', 'warn', 3200);
      return;
    }
    if (!(await authenticateWithBiometrics('생체인증 잠금 켜기'))) return;
    setBiometricLogin(true);
    useAuthStore.getState().unlock();
  };

  const doReset = async () => {
    setResetting(true);
    try {
      // 각 단계는 개별적으로 실패할 수 있다(예약 없음, 서버 응답 없음, 저장소 오류).
      // 어느 하나가 던져도 나머지 초기화는 반드시 끝내야 한다 —
      // 중간에 멈추면 '반쯤 초기화된' 상태로 남아 더 나쁘다.
      try { await cancelAllReminders(); } catch { /* 예약이 없어도 계속 */ }
      try { await logout(); } catch { /* 서버 통지 실패해도 로컬은 비운다 */ }
      queryClient.clear();
      try { await AsyncStorage.clear(); } catch { /* 저장소 오류여도 메모리는 비운다 */ }
      // AsyncStorage.clear() 는 디스크만 지운다. 오프라인 큐는 메모리에도 사본을 들고
      // 있어서, 비우지 않으면 다음 전송 때 방금 지운 기록이 되살아나 서버로 나간다.
      try { await clearQueue(); } catch { /* 큐를 못 비워도 나머지 초기화는 끝낸다 */ }
      resetAll();
      // 디스크(AsyncStorage)뿐 아니라 각 스토어의 '메모리' 상태까지 즉시 비워야
      // 앱을 다시 켜지 않아도 학습완료/출석/도감 등이 깨끗하게 초기화된다.
      // (Q&A·자랑 피드·현장 팁도 여기 포함된다 — 예전에는 이 셋만 빠져 있어서,
      //  디스크는 지워졌는데 메모리에 남은 값이 다음 쓰기 때 그대로 되살아났다.)
      resetAllLocalData();
      // AsyncStorage.clear() 는 주인 기록도 지웠다. 메모리에 남은 주인까지 맞춰 두지
      // 않으면 다음 로그인에서 '주인이 바뀌었다'고 오판해 한 번 더 지우게 된다.
      try { await clearSessionOwner(); } catch { /* 다음 로그인에서 정리된다 */ }
      setResetOpen(false);
      router.replace(ROUTES.login);
    } finally {
      setResetting(false);
    }
  };

  const doLogout = async () => {
    // 서버에 토큰 폐기를 알리지 못해도 로컬 세션은 이미 지워진다.
    // 여기서 예외가 새면 모달이 열린 채 멈춰 사용자가 로그아웃을 못 하게 된다.
    try { await logout(); } catch { /* 무시하고 로그인 화면으로 */ }
    queryClient.clear();
    setLogoutOpen(false);
    router.replace(ROUTES.login);
  };

  /**
   * 이 화면 안에서 '모달을 여는' 항목들 — 검색 결과에서 고르면 스크롤만 하고 끝나면 허무하니
   * 곧바로 해당 모달까지 열어준다(검색 → 목적 달성까지 한 번의 탭).
   */
  const inlineActions: Record<string, () => void> = {
    support: () => setSupportOpen(true),
    changelog: () => setChangelogOpen(true),
    'system-log': () => { void downloadSystemLog(); },
    'notify-time': openTimePicker,
    reset: () => setResetOpen(true),
    logout: () => setLogoutOpen(true),
  };

  const onSearchSelect = useCallback((entry: SettingsEntry) => {
    pushRecentSetting(entry.id);
    if (entry.route === '/settings') {
      focus(entry.id);
      inlineActions[entry.id]?.();
      return;
    }
    // 다른 화면의 항목 — 그 화면으로 이동해 해당 위치를 하이라이트한다.
    router.push({ pathname: entry.route, params: { focus: entry.id } } as never);
  }, [focus, pushRecentSetting, router, openTimePicker]);

  /** 다른 화면으로 이동하는 행 — '최근 본 설정'에도 함께 기록한다. */
  const go = (id: string, route: string) => () => {
    pushRecentSetting(id);
    router.push(route as never);
  };

  const themeLabel = THEME_LABELS[Math.max(0, THEME_OPTIONS.indexOf(themeMode))];
  const ambientLabel = AMBIENT_THEME_OPTIONS.find((o) => o.value === ambientTheme)?.label ?? '없음';

  return (
    <>
      {/* 검색바는 상단에 고정 — 스크롤 위치와 무관하게 항상 한 번에 닿는다. */}
      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4, backgroundColor: c.bg }}>
        <SettingsSearchBar search={search} onSelect={onSearchSelect} collectionEnabled={collectionEnabled} />
      </View>

      <View style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 48, ...contentColumn }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <MeasureOffset>
            {user ? (
              <View style={{ marginTop: 16 }}>
                <MembershipCard
                  name={displayName(user)}
                  email={user.email}
                  org={user.org}
                  membership={user.membership}
                  profileImage={profileImage}
                />
              </View>
            ) : null}

            {/* ── 계정 ─────────────────────────────────────────────── */}
            <SettingsGroup title="계정">
              <SettingsItem
                anchorId="profile"
                icon="person-circle-outline"
                label="프로필 사진 · 소개"
                description="다른 사람에게 보이는 내 모습"
                onPress={go('profile', ROUTES.profile)}
              />
              <SettingsItem
                anchorId="edit-profile"
                icon="create-outline"
                label="계정 정보"
                description="닉네임 · 이름 · 이메일 · 소속 변경"
                onPress={go('edit-profile', ROUTES.editProfile)}
              />
              <SettingsItem
                anchorId="privacy"
                icon="eye-outline"
                label="프로필 공개 범위"
                description="진행도 · 스트릭 · 엠블럼 공개 여부"
                onPress={go('privacy', ROUTES.privacy)}
              />
              <SettingsItem
                anchorId="biometric"
                icon="finger-print-outline"
                label="생체인증 잠금"
                description="앱을 열 때 Face ID · 지문으로 확인해요"
                right={<Switch label="생체인증 잠금" value={biometricLoginEnabled} onValueChange={(v) => { void onToggleBiometric(v); }} />}
              />
              <SettingsItem
                anchorId="logout"
                icon="log-out-outline"
                label="로그아웃"
                description="이 기기에서 계정 연결을 해제해요"
                onPress={() => setLogoutOpen(true)}
              />
            </SettingsGroup>

            {/* ── 학습 ─────────────────────────────────────────────── */}
            <SettingsGroup title="학습">
              <SettingsItem
                anchorId="quiz-examples"
                icon="extension-puzzle-outline"
                label="문제 유형 예시"
                description="복수정답 · 순서맞추기 · 연결하기 체험"
                onPress={go('quiz-examples', ROUTES.quizExamples)}
              />
              {/* 목표 학습량(신규 3장 · 복습 포함 최대 7장)은 고정 정책이라 조절 UI를 두지 않는다. */}
              <SettingsBlock anchorId="interests" label="관심 분야" hint="계정에 저장돼 어느 기기에서나 유지돼요">
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {INTEREST_FIELDS.map((field) => {
                    const active = interests.includes(field);
                    const color = INTEREST_COLOR[field];
                    return (
                      <Pressable
                        key={field}
                        onPress={() => { hapticSelection(); toggleInterest(field); }}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: active }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, backgroundColor: active ? color + '1A' : c.surfaceAlt, borderColor: active ? color : c.border }}
                      >
                        <Ionicons name={INTEREST_ICON[field]} size={14} color={active ? color : c.textSecondary} />
                        <Text style={{ color: active ? color : c.textSecondary, fontSize: 12.5 * fs, fontFamily: fontDisplay }}>{field}</Text>
                        {active && <Ionicons name="checkmark-circle" size={13} color={color} />}
                      </Pressable>
                    );
                  })}
                </View>
              </SettingsBlock>
              <SettingsItem
                anchorId="shuffle"
                icon="shuffle-outline"
                label="카드 순서 섞기"
                description="분야별 복습을 무작위 순서로"
                right={<Switch label="카드 순서 섞기" value={shuffleCards} onValueChange={toggleShuffleCards} />}
              />
              <SettingsItem
                anchorId="weak-spots"
                icon="barbell-outline"
                label="약점 우선 복습"
                description="분야별 복습에서 자주 잊는 카드부터"
                right={<Switch label="약점 우선 복습" value={prioritizeWeakSpots} onValueChange={togglePrioritizeWeakSpots} />}
              />
              <SettingsItem
                anchorId="keep-screen-on"
                icon="sunny-outline"
                label="화면 켜짐 유지"
                description="학습 중 화면 꺼짐 방지"
                right={<Switch label="화면 켜짐 유지" value={keepScreenOn} onValueChange={toggleKeepScreenOn} />}
              />
              <SettingsItem
                anchorId="dont-know-haptic"
                icon="pulse-outline"
                label="'모를 때' 진동"
                description="빨간 버튼(다음에 한번 더)에만 미세한 진동"
                right={<Switch label="'모를 때' 진동" value={dontKnowHaptic} onValueChange={toggleDontKnowHaptic} />}
              />
              <SettingsItem
                anchorId="offline"
                icon="cloud-offline-outline"
                label="데이터 절약"
                description="모바일 데이터에서는 사진을 눌러야 불러와요"
                right={<Switch label="데이터 절약" value={offlineMode} onValueChange={toggleOfflineMode} />}
              />
            </SettingsGroup>

            {/* ── 알림 ─────────────────────────────────────────────── */}
            <SettingsGroup
              title="알림"
              caption="꼭 필요한 학습 리마인더 · 성취 · 공지만 보내요. 종류별로 끄려면 알림함에서 관리할 수 있어요."
            >
              <SettingsItem
                anchorId="notify-enabled"
                icon="notifications-outline"
                label="알림 받기"
                description="학습 리마인더 · 성취 · 공지"
                right={<Switch label="알림 받기" value={notifications.enabled} onValueChange={(v) => { void onToggleNotification(v); }} />}
              />
              <SettingsItem
                anchorId="notify-time"
                icon="alarm-outline"
                label="알림 시간"
                description={notifications.enabled ? '매일 이 시각에 알려드려요' : '알림을 켜면 적용돼요'}
                value={notifications.dailyReminderTime}
                onPress={openTimePicker}
              />
              <SettingsItem
                anchorId="notify-inbox"
                icon="mail-outline"
                label="알림함 열기"
                description="받은 알림 확인 · 종류별 끄기"
                onPress={go('notify-inbox', ROUTES.notifications)}
              />
            </SettingsGroup>

            {/* ── 화면 ─────────────────────────────────────────────── */}
            <SettingsGroup title="화면">
              <SettingsBlock anchorId="theme" label="테마" hint={`지금: ${themeLabel}`}>
                <SegmentedControl
                  options={THEME_LABELS}
                  selectedIndex={THEME_OPTIONS.indexOf(themeMode)}
                  onChange={(i) => setThemeMode(THEME_OPTIONS[i])}
                />
              </SettingsBlock>
              <SettingsBlock anchorId="font-scale" label="글자 크기" hint="앱 전체 글씨 크기를 한 번에 조절해요">
                <SegmentedControl
                  options={FONT_LABELS}
                  selectedIndex={FONT_OPTIONS.indexOf(fontScaleSetting)}
                  onChange={(i) => setFontScale(FONT_OPTIONS[i])}
                />
              </SettingsBlock>
              <SettingsBlock anchorId="ambient" label="배경 테마" hint={`흰 배경 위에 얹는 분위기 효과 — 지금: ${ambientLabel}`}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {AMBIENT_THEME_OPTIONS.map((opt) => {
                    const active = ambientTheme === opt.value;
                    return (
                      <Pressable
                        key={opt.value}
                        onPress={() => { hapticSelection(); setAmbientTheme(opt.value); }}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: active ? c.primary : c.surfaceAlt, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8, borderWidth: 1, borderColor: active ? c.primary : c.border }}
                      >
                        <Ionicons name={opt.icon as never} size={14} color={active ? '#fff' : c.textSecondary} />
                        <Text style={{ color: active ? '#fff' : c.textPrimary, fontSize: 13 * fs, fontWeight: active ? '800' : '600', fontFamily: fontCute }}>{opt.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </SettingsBlock>
              <SettingsItem
                anchorId="high-contrast"
                icon="contrast-outline"
                label="고대비 모드"
                description="야외 · 저조도 가독성 강화"
                right={<Switch label="고대비 모드" value={highContrast} onValueChange={toggleHighContrast} />}
              />
            </SettingsGroup>

            {/* ── 커뮤니티 · 수집 ──────────────────────────────────── */}
            <SettingsGroup title="커뮤니티 · 수집">
              {/* '자랑(플렉스) 유도' 스위치는 여기 없다. 그 스위치가 켜고 끄던 학습 완료
                  화면의 자랑 CTA 가 제품 결정으로 꺼져 있어(cards.tsx), 스위치를 눌러도
                  아무 일도 일어나지 않았다. CTA 가 돌아오는 날 함께 되살린다
                  (값 자체는 계정 설정으로 계속 동기화된다 — UserSettings). */}
              <SettingsItem
                anchorId="achievement-badge"
                icon="shield-checkmark-outline"
                label="성취 뱃지 표시"
                description="닉네임 옆에 최고 등급 뱃지 노출"
                right={<Switch label="성취 뱃지 표시" value={showAchievementBadge} onValueChange={toggleAchievementBadge} />}
              />
              <SettingsItem
                anchorId="collection"
                icon="albums-outline"
                label="카드 수집 · 카드팩"
                description="회의 확정 전까지 설정에서만 켤 수 있어요"
                badge="베타"
                right={<Switch label="카드 수집 · 카드팩" value={collectionEnabled} onValueChange={toggleCollectionEnabled} />}
              />
              {collectionEnabled ? (
                <SettingsItem
                  anchorId="collection-book"
                  icon="library-outline"
                  label="안전 카드 컬렉션"
                  description="수집한 카드 · 카드팩 열기"
                  onPress={go('collection-book', ROUTES.collectionBook)}
                />
              ) : null}
              {collectionEnabled ? (
                <SettingsItem
                  anchorId="pack-rules"
                  icon="gift-outline"
                  label="카드팩 획득 조건"
                  description="학습 · 출석 · 연속 조건 보기"
                  onPress={go('pack-rules', ROUTES.packRules)}
                />
              ) : null}
            </SettingsGroup>

            {/* ── 지원 ─────────────────────────────────────────────── */}
            <SettingsGroup title="지원">
              <SettingsItem
                anchorId="support"
                icon="chatbubble-ellipses-outline"
                label="고객센터 문의"
                description="운영진에게 1:1 문의 남기기"
                onPress={() => { pushRecentSetting('support'); setSupportOpen(true); }}
              />
              <SettingsItem
                anchorId="faq"
                icon="help-circle-outline"
                label="자주 묻는 질문"
                description="먼저 확인하면 더 빨라요"
                onPress={go('faq', ROUTES.support)}
              />
              <SettingsItem
                anchorId="changelog"
                icon="sparkles-outline"
                label="업데이트 내역"
                description="새 기능 · 개선 사항"
                value={`v${env.build.version}`}
                onPress={() => { pushRecentSetting('changelog'); setChangelogOpen(true); }}
              />
              <SettingsItem
                anchorId="system-log"
                icon="download-outline"
                label="시스템 로그 다운로드"
                description="오류 신고 시 함께 보내주세요"
                onPress={() => { void downloadSystemLog(); }}
              />
              <SettingsItem
                anchorId="developer"
                icon="construct-outline"
                label="개발자 모드"
                description="내부 테스트용 기능"
                onPress={go('developer', ROUTES.developer)}
              />
              {/* '관리 콘솔' 항목은 여기 없다.
                  운영 콘솔은 브릿지 운영관리로 옮겨 갔고(docs/PLATFORM_SPLIT.md §1),
                  앱 안에 남은 화면은 목업 데이터를 들여다보는 개발 도구다. 그것이
                  설정의 '지원' 그룹에서 모두에게 열려 있으면, 일반 사용자가 들어가
                  운영과 아무 상관 없는 숫자를 실제 운영값으로 읽는다.
                  진입은 개발자 모드 안(목업 모드에서만)으로 옮겼다. */}
            </SettingsGroup>

            {/* ── 데이터 ───────────────────────────────────────────── */}
            <SettingsGroup title="데이터">
              <SettingsItem
                anchorId="reset"
                icon="trash-outline"
                label="데이터 초기화"
                description="이 기기의 로컬 데이터를 모두 삭제해요"
                destructive
                onPress={() => setResetOpen(true)}
              />
            </SettingsGroup>

            {/* ── 약관 · 법적 고지 (항상 맨 아래) ──────────────────── */}
            <SettingsGroup
              title="약관 · 법적 고지"
              caption={`${APP_NAME}은(는) 사내 구성원 대상 학습 서비스입니다. 이용약관 · 개인정보 처리방침 · 접근권한 · 오픈소스 고지를 한 화면에서 확인할 수 있어요.`}
            >
              <SettingsItem
                anchorId="legal-entry"
                icon="document-text-outline"
                label="약관 · 법적 고지 전체 보기"
                description="이용약관 · 개인정보 처리방침 · 오픈소스 라이선스"
                onPress={go('terms', ROUTES.legal)}
              />
              <SettingsItem
                anchorId="privacy-policy-entry"
                icon="lock-closed-outline"
                label="개인정보 처리방침"
                description="수집 항목 · 보유 기간 · 파기 · 권리 행사"
                onPress={() => {
                  pushRecentSetting('privacy-policy');
                  router.push({ pathname: ROUTES.legal, params: { focus: 'privacy-policy' } } as never);
                }}
              />
              <SettingsItem
                anchorId="consent-entry"
                icon="megaphone-outline"
                label="알림 · 수신 동의 관리"
                description="광고성 정보 수신 동의 및 철회"
                value={notifications.marketing ? '동의함' : '미동의'}
                onPress={() => {
                  pushRecentSetting('consent-marketing');
                  router.push({ pathname: ROUTES.legal, params: { focus: 'consent-marketing' } } as never);
                }}
              />
            </SettingsGroup>

            <View style={{ alignItems: 'center', marginTop: 26, gap: 4 }}>
              <Text style={{ color: c.textSecondary, fontSize: 12, fontFamily: fontMono }}>
                {APP_NAME} v{env.build.version} · build {env.build.buildNumber}
              </Text>
              <Text style={{ color: c.textSecondary, fontSize: 11, opacity: 0.7, fontFamily: fontMono }}>
                {'LIVE'} · {env.build.commit.slice(0, 7)}
              </Text>
            </View>
          </MeasureOffset>
        </ScrollView>

        {/* 검색 결과는 본문 위에 덮는다 — 본문을 언마운트하지 않아야 결과를 골랐을 때
            그 항목의 정확한 위치로 스크롤·하이라이트할 수 있다. */}
        {search.searching ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: c.bg }]}>
            <SettingsSearchResults search={search} onSelect={onSearchSelect} />
          </View>
        ) : null}
      </View>

      {/* 알림 시간 설정 */}
      <Modal visible={timePickerOpen} transparent animationType="fade" onRequestClose={() => setTimePickerOpen(false)}>
        {/* 배경은 '탭하면 닫히는 판'이지만 내용을 품지 않는다 — 품으면 웹에서 <button> 안에
            <button>(값 올리기/내리기·저장)이 되어 유효하지 않은 DOM 이고, 스크린 리더가
            중첩된 컨트롤을 제대로 읽지 못한다. 화면을 덮는 **형제**로 깔고 그 위에 내용을 얹는다.
            가운데 정렬 층은 pointerEvents="box-none" 이라 빈 곳을 누르면 아래 배경이 받는다.
            내용은 그냥 View 면 된다. 형제인 배경은 내용 탭을 받지 못하므로,
            예전에 탭을 삼키려고 두었던 빈 Pressable(onPress={() => {}})은 필요 없다. */}
        <View style={{ flex: 1 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="닫기" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)' }]} onPress={() => setTimePickerOpen(false)} />
          <View pointerEvents="box-none" style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ backgroundColor: c.surface, borderRadius: 24, padding: 24, width: 280, borderWidth: 1, borderColor: c.border, boxShadow: '0 12px 40px rgba(0,0,0,0.3)', elevation: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 18 }}>
                <Ionicons name="alarm-outline" size={20} color={c.primary} />
                <Text style={{ color: c.textPrimary, fontSize: 17 * fs, fontWeight: '800', textAlign: 'center', fontFamily: fontCute }}>알림 시간 설정</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 22 }}>
                {[
                  { val: editH, set: (v: number) => setEditH((v + 24) % 24) },
                  { val: editM, set: (v: number) => setEditM((v + 60) % 60) },
                ].map((wheel, idx) => (
                  <React.Fragment key={idx}>
                    {idx === 1 && <Text style={{ color: c.textSecondary, fontSize: 28, fontWeight: '800' }}>:</Text>}
                    <View style={{ alignItems: 'center' }}>
                      <Pressable onPress={() => { hapticSelection(); wheel.set(wheel.val + 1); }} hitSlop={8} style={{ padding: 6 }} accessibilityRole="button" accessibilityLabel="값 올리기">
                        <Ionicons name="chevron-up" size={20} color={c.textPrimary} />
                      </Pressable>
                      <Text style={{ color: c.textPrimary, fontSize: 36, fontWeight: '800', fontFamily: fontMono, paddingVertical: 6 }}>
                        {String(wheel.val).padStart(2, '0')}
                      </Text>
                      <Pressable onPress={() => { hapticSelection(); wheel.set(wheel.val - 1); }} hitSlop={8} style={{ padding: 6 }} accessibilityRole="button" accessibilityLabel="값 내리기">
                        <Ionicons name="chevron-down" size={20} color={c.textPrimary} />
                      </Pressable>
                    </View>
                  </React.Fragment>
                ))}
              </View>
              <Button label="저장" onPress={saveTime} />
            </View>
          </View>
        </View>
      </Modal>

      {/* 고객센터 문의 */}
      <SupportModal visible={supportOpen} onClose={() => setSupportOpen(false)} defaultEmail={user?.email} />

      {/* 업데이트 내역 */}
      <ChangelogModal visible={changelogOpen} onClose={() => setChangelogOpen(false)} />

      {/* 로그아웃 확인 */}
      <CenterModal visible={logoutOpen} onClose={() => setLogoutOpen(false)} title="로그아웃" icon="log-out-outline">
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: c.textSecondary, fontSize: 13 * fs, lineHeight: 20, textAlign: 'center', marginBottom: 20 }}>
            학습 기록은 계정에 그대로 남아요.{'\n'}다시 로그인하면 이어서 학습할 수 있어요.
          </Text>
          <Button label="로그아웃" onPress={() => { void doLogout(); }} style={{ width: '100%' }} />
          <Pressable accessibilityRole="button" onPress={() => setLogoutOpen(false)} style={{ paddingVertical: 14 }}>
            <Text style={{ color: c.textSecondary, fontWeight: '600', fontFamily: fontCute }}>취소</Text>
          </Pressable>
        </View>
      </CenterModal>

      {/* 데이터 초기화 확인 */}
      <CenterModal visible={resetOpen} onClose={() => !resetting && setResetOpen(false)} title="데이터 초기화" icon="warning-outline">
        <View style={{ alignItems: 'center' }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.error + '1A', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Ionicons name="trash" size={30} color={c.error} />
          </View>
          <Text style={{ color: c.textPrimary, fontSize: 16 * fs, fontWeight: '800', fontFamily: fontCute, marginBottom: 8, textAlign: 'center' }}>
            정말 초기화할까요?
          </Text>
          <Text style={{ color: c.textSecondary, fontSize: 13 * fs, lineHeight: 20, textAlign: 'center', marginBottom: 22 }}>
            로그인 정보와 앱 설정, 학습 캐시가{'\n'}모두 삭제되며 되돌릴 수 없습니다.
          </Text>
          <Button label="모두 삭제하고 초기화" loading={resetting} colorOverride={c.error} onPress={doReset} style={{ width: '100%' }} />
          <Pressable accessibilityRole="button" onPress={() => !resetting && setResetOpen(false)} style={{ paddingVertical: 14 }}>
            <Text style={{ color: c.textSecondary, fontWeight: '600', fontFamily: fontCute }}>취소</Text>
          </Pressable>
        </View>
      </CenterModal>
    </>
  );
}

/** 그룹 내 세로 블록(라벨 + 전체폭 컨트롤) — 세그먼트 컨트롤·칩처럼 넓은 요소에 쓴다. */
function SettingsBlock({
  label,
  hint,
  anchorId,
  children,
}: {
  label: string;
  hint?: string;
  anchorId?: string;
  children: React.ReactNode;
}) {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  const body = (
    <View style={{ paddingHorizontal: 14, paddingVertical: 13, gap: 10 }}>
      <View style={{ gap: 2 }}>
        <Text style={{ color: c.textPrimary, fontSize: 15 * fontScale, fontWeight: '600', fontFamily: fontCute }}>
          {label}
        </Text>
        {hint ? (
          <Text style={{ color: c.textSecondary, fontSize: 12 * fontScale }}>{hint}</Text>
        ) : null}
      </View>
      {children}
    </View>
  );
  return anchorId ? <FocusAnchor id={anchorId}>{body}</FocusAnchor> : body;
}
