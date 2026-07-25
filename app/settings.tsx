import React, { useState } from 'react';
import { View, Text, ScrollView, Platform, Pressable, Modal, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../src/theme/ThemeProvider';
import { useSettingsStore, type ThemeMode, type FontScale } from '../src/store/settingsStore';
import { useAuthStore } from '../src/store/authStore';
import { resetLearningStores } from '../src/store/resetAppData';
import { SegmentedControl } from '../src/components/ui/SegmentedControl';
import { Switch } from '../src/components/ui/Switch';
import { Button } from '../src/components/ui/Button';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { SettingsGroup, SettingsItem } from '../src/components/ui/SettingsGroup';
import { AMBIENT_THEME_OPTIONS } from '../src/constants/ambient';
import { MembershipCard } from '../src/components/settings/MembershipCard';
import { SupportModal } from '../src/components/settings/SupportModal';
import { ChangelogModal } from '../src/components/settings/ChangelogModal';
import { CenterModal } from '../src/components/ui/CenterModal';
import { fontMono, fontCute, fontDisplay, fontBody } from '../src/theme/tokens';
import { INTEREST_FIELDS, INTEREST_COLOR, INTEREST_ICON } from '../src/constants/interests';
import { env } from '../src/data/network/env';
import { ROUTES } from '../src/constants/routes';
import { downloadSystemLog } from '../src/utils/downloadLog';
import {
  requestNotificationPermission,
  scheduleDailyReminder,
  cancelAllReminders,
  syncPushTokenWithServer,
} from '../src/data/notifications/NotificationService';
import { APP_NAME } from '../src/constants/brand';

const THEME_OPTIONS: ThemeMode[] = ['light', 'dark', 'dim', 'system'];
const THEME_LABELS = ['Light', 'Dark', 'Dim', 'System'];
const FONT_OPTIONS: FontScale[] = ['xsmall', 'small', 'medium', 'large', 'xlarge'];
const FONT_LABELS = ['XS', 'S', 'M', 'L', 'XL'];

/** 그룹 내 세로 블록(라벨 + 전체폭 컨트롤). 세그먼트 컨트롤처럼 넓은 요소에 사용. */
function SettingsBlock({ label, children }: { label: string; children: React.ReactNode }) {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  return (
    <View style={{ paddingHorizontal: 14, paddingVertical: 13, gap: 10 }}>
      <Text style={{ color: c.textPrimary, fontSize: 15 * fontScale, fontWeight: '600', fontFamily: fontCute }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

export default function SettingsScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const queryClient = useQueryClient();

  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const {
    themeMode, fontScale: fontScaleSetting, highContrast,
    notifications, biometricLoginEnabled, dailyTarget, shuffleCards, keepScreenOn, offlineMode,
    prioritizeWeakSpots, dontKnowHaptic, flexPromptEnabled, showAchievementBadge, collectionEnabled,
    setThemeMode, setFontScale, toggleHighContrast,
    updateNotificationSetting, setBiometricLogin, setDailyTarget,
    toggleShuffleCards, toggleKeepScreenOn, toggleOfflineMode, togglePrioritizeWeakSpots,
    toggleDontKnowHaptic, toggleFlexPrompt, toggleAchievementBadge, toggleCollectionEnabled, resetAll,
    ambientTheme, setAmbientTheme,
  } = useSettingsStore();

  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const profileImage = useSettingsStore((s) => s.profileImage);
  const interests = useSettingsStore((s) => s.interests);
  const toggleInterest = useSettingsStore((s) => s.toggleInterest);

  const [h, m] = notifications.dailyReminderTime.split(':').map(Number);
  const [editH, setEditH] = useState(h);
  const [editM, setEditM] = useState(m);

  const openTimePicker = () => {
    const [ch, cm] = notifications.dailyReminderTime.split(':').map(Number);
    setEditH(ch); setEditM(cm);
    setTimePickerOpen(true);
  };

  const saveTime = async () => {
    const t = `${String(editH).padStart(2, '0')}:${String(editM).padStart(2, '0')}`;
    updateNotificationSetting('dailyReminderTime', t);
    if (notifications.enabled) await scheduleDailyReminder(t);
    setTimePickerOpen(false);
  };

  const onToggleNotification = async (enabled: boolean) => {
    if (enabled) {
      const granted = await requestNotificationPermission();
      if (!granted && Platform.OS !== 'web') return;
      await scheduleDailyReminder(notifications.dailyReminderTime);
      // 실서버 사용 시 원격 푸시 토큰도 함께 등록(서버·텔레그램 알림 수신용).
      void syncPushTokenWithServer();
    } else {
      await cancelAllReminders();
    }
    updateNotificationSetting('enabled', enabled);
  };

  const doReset = async () => {
    setResetting(true);
    try {
      await cancelAllReminders();
      await logout();
      queryClient.clear();
      await AsyncStorage.clear();
      resetAll();
      // 디스크(AsyncStorage)뿐 아니라 각 스토어의 '메모리' 상태까지 즉시 비워야
      // 앱을 다시 켜지 않아도 학습완료/출석/도감 등이 깨끗하게 초기화된다.
      resetLearningStores();
      setResetOpen(false);
      router.replace(ROUTES.login);
    } finally {
      setResetting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title="설정" />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 48 }}>
        {user ? (
          <MembershipCard
            name={user.name}
            email={user.email}
            org={user.org}
            membership={user.membership}
            profileImage={profileImage}
          />
        ) : null}

        <SettingsGroup title="관심 분야">
          <SettingsBlock label="관심 분야 선택 (통계·추천에 반영)">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {INTEREST_FIELDS.map((field) => {
                const active = interests.includes(field);
                const color = INTEREST_COLOR[field];
                return (
                  <Pressable key={field} onPress={() => toggleInterest(field)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, backgroundColor: active ? color + '1A' : c.surfaceAlt, borderColor: active ? color : c.border }}>
                    <Ionicons name={INTEREST_ICON[field]} size={14} color={active ? color : c.textSecondary} />
                    <Text style={{ color: active ? color : c.textSecondary, fontSize: 12.5, fontFamily: fontDisplay }}>{field}</Text>
                    {active && <Ionicons name="checkmark-circle" size={13} color={color} />}
                  </Pressable>
                );
              })}
            </View>
          </SettingsBlock>
        </SettingsGroup>

        <SettingsGroup title="알림">
          {/* 알림 설정은 홈 상단 '알림(종 아이콘)' 화면에서 한곳으로 관리한다.
              (복습 주기·새 콘텐츠 알림은 제외 — 꼭 필요한 성취·공지 알림만 보낸다.) */}
          <SettingsItem
            icon="notifications-outline"
            label="알림 설정"
            description="성취·공지 알림 받기 (홈 알림에서 관리)"
            onPress={() => router.push(ROUTES.notifications as never)}
          />
        </SettingsGroup>

        <SettingsGroup title="학습">
          {/* 목표 학습량(신규 3장·복습 포함 5장)은 고정 정책이라 조절 UI를 노출하지 않는다. */}
          <SettingsItem
            icon="shuffle-outline"
            label="카드 순서 섞기"
            right={<Switch value={shuffleCards} onValueChange={toggleShuffleCards} />}
          />
          <SettingsItem
            icon="barbell-outline"
            label="약점 우선 복습"
            description="복습 시작 시 자주 잊는 카드를 먼저"
            right={<Switch value={prioritizeWeakSpots} onValueChange={togglePrioritizeWeakSpots} />}
          />
          <SettingsItem
            icon="sunny-outline"
            label="화면 켜짐 유지"
            description="학습 중 화면 꺼짐 방지"
            right={<Switch value={keepScreenOn} onValueChange={toggleKeepScreenOn} />}
          />
          <SettingsItem
            icon="pulse-outline"
            label="'모를 때' 진동"
            description="빨간 버튼(다음에 한번 더)에만 미세한 진동"
            right={<Switch value={dontKnowHaptic} onValueChange={toggleDontKnowHaptic} />}
          />
        </SettingsGroup>

        <SettingsGroup title="프로필 · 커뮤니티">
          <SettingsItem
            icon="person-circle-outline"
            label="내 프로필"
            description="사진·한 줄 소개 편집"
            onPress={() => router.push(ROUTES.profile as never)}
          />
          <SettingsItem
            icon="sparkles-outline"
            label="자랑(플렉스) 유도"
            description="목표 달성 시 성취 카드 자랑을 제안"
            right={<Switch value={flexPromptEnabled} onValueChange={toggleFlexPrompt} />}
          />
          <SettingsItem
            icon="shield-checkmark-outline"
            label="성취 뱃지 표시"
            description="닉네임 옆에 최고 등급 카드 뱃지 노출"
            right={<Switch value={showAchievementBadge} onValueChange={toggleAchievementBadge} />}
          />
        </SettingsGroup>

        <SettingsGroup title="카드 수집 (베타)">
          <SettingsItem
            icon="albums-outline"
            label="카드 수집·카드팩 사용"
            description="회의 확정 전까지 설정에서만 켤 수 있어요"
            right={<Switch value={collectionEnabled} onValueChange={toggleCollectionEnabled} />}
          />
          {collectionEnabled && (
            <>
              <SettingsItem
                icon="library-outline"
                label="안전 카드 컬렉션"
                description="수집한 카드·카드팩 열기"
                onPress={() => router.push(ROUTES.collectionBook as never)}
              />
              <SettingsItem
                icon="gift-outline"
                label="카드팩 획득 조건"
                description="학습·출석·연속 등 상세 조건 보기"
                onPress={() => router.push(ROUTES.packRules as never)}
              />
            </>
          )}
        </SettingsGroup>

        <SettingsGroup title="화면">
          <SettingsBlock label="테마">
            <SegmentedControl options={THEME_LABELS} selectedIndex={THEME_OPTIONS.indexOf(themeMode)} onChange={(i) => setThemeMode(THEME_OPTIONS[i])} />
          </SettingsBlock>
          <SettingsBlock label="글자 크기">
            <SegmentedControl options={FONT_LABELS} selectedIndex={FONT_OPTIONS.indexOf(fontScaleSetting)} onChange={(i) => setFontScale(FONT_OPTIONS[i])} />
          </SettingsBlock>
          <SettingsBlock label="배경 테마">
            <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, marginTop: -4, marginBottom: 2 }}>흰 배경 위에 은은한 분위기 효과를 얹어요(학습카드 화면은 제외).</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {AMBIENT_THEME_OPTIONS.map((opt) => {
                const active = ambientTheme === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setAmbientTheme(opt.value)}
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
            icon="contrast-outline"
            label="고대비 모드"
            description="야외/저조도 가독성 강화"
            right={<Switch value={highContrast} onValueChange={toggleHighContrast} />}
          />
          <SettingsItem
            icon="cloud-offline-outline"
            label="오프라인 모드"
            description="Wi-Fi에서만 콘텐츠 다운로드"
            right={<Switch value={offlineMode} onValueChange={toggleOfflineMode} />}
          />
        </SettingsGroup>

        <SettingsGroup title="계정">
          <SettingsItem
            icon="finger-print-outline"
            label="생체인증 로그인"
            description="Face ID/지문으로 빠른 로그인"
            right={<Switch value={biometricLoginEnabled} onValueChange={setBiometricLogin} />}
          />
          <SettingsItem
            icon="person-circle-outline"
            label="프로필 관리"
            description="사진·한 줄 소개 변경"
            onPress={() => router.push(ROUTES.profile as never)}
          />
        </SettingsGroup>

        <SettingsGroup title="지원 및 정보">
          <SettingsItem icon="chatbubble-ellipses-outline" label="고객센터 문의" onPress={() => setSupportOpen(true)} />
          <SettingsItem icon="sparkles-outline" label="업데이트 내역" description={`현재 v${env.build.version}`} onPress={() => setChangelogOpen(true)} />
          <SettingsItem icon="download-outline" label="시스템 로그 다운로드" onPress={() => { void downloadSystemLog(); }} />
          <SettingsItem icon="document-text-outline" label="이용약관 · 개인정보처리방침" onPress={() => Linking.openURL('https://bridge.kfpa.or.kr/')} />
          <SettingsItem icon="construct-outline" label="개발자 모드" description="테스트용 기능" onPress={() => router.push(ROUTES.developer)} />
          <SettingsItem icon="shield-half-outline" label="관리 콘솔" description="웹 관리자 페이지 (사용자·규칙·카드·플래그)" onPress={() => router.push(ROUTES.admin as never)} />
        </SettingsGroup>

        <SettingsGroup title="데이터">
          <SettingsItem
            icon="trash-outline"
            label="데이터 초기화"
            description="로컬 저장 데이터를 모두 삭제합니다"
            destructive
            onPress={() => setResetOpen(true)}
          />
        </SettingsGroup>

        <View style={{ alignItems: 'center', marginTop: 28, gap: 4 }}>
          <Text style={{ color: c.textSecondary, fontSize: 12, fontFamily: fontMono }}>
            {APP_NAME} v{env.build.version} · build {env.build.buildNumber}
          </Text>
          <Text style={{ color: c.textSecondary, fontSize: 11, opacity: 0.7, fontFamily: fontMono }}>
            {env.useMockData ? 'MOCK DATA' : 'LIVE'} · {env.build.commit.slice(0, 7)}
          </Text>
        </View>
      </ScrollView>

      {/* 알림 시간 설정 */}
      <Modal visible={timePickerOpen} transparent animationType="fade" onRequestClose={() => setTimePickerOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }} onPress={() => setTimePickerOpen(false)}>
          <Pressable onPress={() => {}} style={{ backgroundColor: c.surface, borderRadius: 24, padding: 24, width: 280, borderWidth: 1, borderColor: c.border, boxShadow: '0 12px 40px rgba(0,0,0,0.3)', elevation: 12 }}>
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
                    <Pressable onPress={() => wheel.set(wheel.val + 1)} hitSlop={8} style={{ padding: 6 }}>
                      <Ionicons name="chevron-up" size={20} color={c.textPrimary} />
                    </Pressable>
                    <Text style={{ color: c.textPrimary, fontSize: 36, fontWeight: '800', fontFamily: fontMono, paddingVertical: 6 }}>
                      {String(wheel.val).padStart(2, '0')}
                    </Text>
                    <Pressable onPress={() => wheel.set(wheel.val - 1)} hitSlop={8} style={{ padding: 6 }}>
                      <Ionicons name="chevron-down" size={20} color={c.textPrimary} />
                    </Pressable>
                  </View>
                </React.Fragment>
              ))}
            </View>
            <Button label="저장" onPress={saveTime} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* 고객센터 문의 */}
      <SupportModal visible={supportOpen} onClose={() => setSupportOpen(false)} defaultEmail={user?.email} />

      {/* 업데이트 내역 */}
      <ChangelogModal visible={changelogOpen} onClose={() => setChangelogOpen(false)} />

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
          <Pressable onPress={() => !resetting && setResetOpen(false)} style={{ paddingVertical: 14 }}>
            <Text style={{ color: c.textSecondary, fontWeight: '600', fontFamily: fontCute }}>취소</Text>
          </Pressable>
        </View>
      </CenterModal>
    </View>
  );
}
