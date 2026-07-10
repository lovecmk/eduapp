import React, { useState } from 'react';
import { View, Text, ScrollView, Switch, Alert, Platform, Pressable, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/ThemeProvider';
import { useSettingsStore, type ThemeMode, type FontScale } from '../src/store/settingsStore';
import { useAuthStore } from '../src/store/authStore';
import { useCardStore } from '../src/store/cardStore';
import { useStatsStore } from '../src/store/statsStore';
import { SettingRow } from '../src/components/ui/SettingRow';
import { SegmentedControl } from '../src/components/ui/SegmentedControl';
import { Button } from '../src/components/ui/Button';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { fontMono, fontCute } from '../src/theme/tokens';
import { ROUTES } from '../src/constants/routes';
import {
  requestNotificationPermission,
  scheduleDailyReminder,
  cancelAllReminders,
} from '../src/data/notifications/NotificationService';

function SectionLabel({ children }: { children: React.ReactNode }) {
  const { theme, fontScale } = useTheme();
  return (
    <Text style={{ color: theme.colors.textSecondary, fontSize: 13 * fontScale, fontWeight: '700', marginTop: 24, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: fontCute }}>
      {children}
    </Text>
  );
}

const THEME_OPTIONS: ThemeMode[] = ['light', 'dark', 'dim', 'system'];
const THEME_LABELS = ['Light', 'Dark', 'Dim', 'System'];
const FONT_OPTIONS: FontScale[] = ['xsmall', 'small', 'medium', 'large', 'xlarge'];
const FONT_LABELS = ['XS', 'S', 'M', 'L', 'XL'];

export default function SettingsScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const [timePickerOpen, setTimePickerOpen] = useState(false);

  const {
    themeMode, fontScale: fontScaleSetting, highContrast,
    notifications, biometricLoginEnabled, dailyTarget, shuffleCards, keepScreenOn, offlineMode,
    setThemeMode, setFontScale, toggleHighContrast,
    updateNotificationSetting, setBiometricLogin, setDailyTarget,
    toggleShuffleCards, toggleKeepScreenOn, toggleOfflineMode,
  } = useSettingsStore();

  const logout = useAuthStore((s) => s.logout);
  const resetCards = useCardStore((s) => s.reset);
  const resetStats = useStatsStore((s) => s.reset);

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
    } else {
      await cancelAllReminders();
    }
    updateNotificationSetting('enabled', enabled);
  };

  const doLogout = async () => {
    await logout();
    resetCards();
    resetStats();
    router.replace(ROUTES.login as any);
  };

  const onLogout = () => {
    if (Platform.OS === 'web') {
      doLogout();
    } else {
      Alert.alert('로그아웃', '정말 로그아웃하시겠어요?', [
        { text: '취소', style: 'cancel' },
        { text: '로그아웃', style: 'destructive', onPress: doLogout },
      ]);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title="설정" />

      <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
        <SectionLabel>알림</SectionLabel>
        <SettingRow label="학습 리마인더" description="매일 정해진 시간에 알림"
          right={<Switch value={notifications.enabled} onValueChange={onToggleNotification} trackColor={{ true: c.primary, false: c.disabled }} thumbColor={Platform.OS === 'android' ? c.primary : undefined} />}
        />
        <SettingRow label="알림 시간" right={
          <Pressable onPress={openTimePicker}>
            <Text style={{ color: c.primary, fontWeight: '600', fontFamily: fontMono }}>{notifications.dailyReminderTime}</Text>
          </Pressable>
        } />
        <SettingRow label="복습 예정 알림" description="망각곡선 기준 복습 시점"
          right={<Switch value={notifications.reviewAlerts} onValueChange={(v) => updateNotificationSetting('reviewAlerts', v)} trackColor={{ true: c.primary, false: c.disabled }} thumbColor={Platform.OS === 'android' ? c.primary : undefined} />}
        />
        <SettingRow label="주간 리포트"
          right={<Switch value={notifications.weeklyReport} onValueChange={(v) => updateNotificationSetting('weeklyReport', v)} trackColor={{ true: c.primary, false: c.disabled }} thumbColor={Platform.OS === 'android' ? c.primary : undefined} />}
        />

        <SectionLabel>학습</SectionLabel>
        <View style={{ backgroundColor: c.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: c.border, marginBottom: 10, marginTop: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.textPrimary, fontSize: 14 * fs, fontWeight: '600', fontFamily: fontCute }}>목표 학습량</Text>
              <Text style={{ color: c.textSecondary, fontSize: 11, marginTop: 2 }}>하루 목표 카드 수</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pressable onPress={() => setDailyTarget(Math.max(3, dailyTarget - 1))}
                style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border }}>
                <Ionicons name="remove" size={18} color={c.textPrimary} />
              </Pressable>
              <Text style={{ color: c.textPrimary, fontSize: 17, fontWeight: '800', fontFamily: fontMono, minWidth: 28, textAlign: 'center' }}>{dailyTarget}</Text>
              <Pressable onPress={() => setDailyTarget(Math.min(50, dailyTarget + 1))}
                style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border }}>
                <Ionicons name="add" size={18} color={c.textPrimary} />
              </Pressable>
            </View>
          </View>
        </View>
        <SettingRow label="화면 켜짐 유지" description="학습 중 화면 꺼짐 방지"
          right={<Switch value={keepScreenOn} onValueChange={toggleKeepScreenOn} trackColor={{ true: c.primary, false: c.disabled }} thumbColor={Platform.OS === 'android' ? c.primary : undefined} />}
        />

        <SectionLabel>화면</SectionLabel>
        <SettingRow label="테마"
          right={<SegmentedControl options={THEME_LABELS} selectedIndex={THEME_OPTIONS.indexOf(themeMode)} onChange={(i) => setThemeMode(THEME_OPTIONS[i])} />}
        />
        <SettingRow label="글자 크기"
          right={<SegmentedControl options={FONT_LABELS} selectedIndex={FONT_OPTIONS.indexOf(fontScaleSetting)} onChange={(i) => setFontScale(FONT_OPTIONS[i])} />}
        />
        <SettingRow label="고대비 모드" description="야외/저조도 가독성 강화"
          right={<Switch value={highContrast} onValueChange={toggleHighContrast} trackColor={{ true: c.primary, false: c.disabled }} thumbColor={Platform.OS === 'android' ? c.primary : undefined} />}
        />
        <SettingRow label="오프라인 모드" description="Wi-Fi에서만 콘텐츠 다운로드"
          right={<Switch value={offlineMode} onValueChange={toggleOfflineMode} trackColor={{ true: c.primary, false: c.disabled }} thumbColor={Platform.OS === 'android' ? c.primary : undefined} />}
        />

        <SectionLabel>계정</SectionLabel>
        <SettingRow label="생체인증 로그인" description="Face ID/지문으로 빠른 로그인"
          right={<Switch value={biometricLoginEnabled} onValueChange={setBiometricLogin} trackColor={{ true: c.primary, false: c.disabled }} thumbColor={Platform.OS === 'android' ? c.primary : undefined} />}
        />
        <View style={{ marginTop: 12 }}>
          <Button label="로그아웃" variant="outline" colorOverride={c.error} onPress={onLogout} />
        </View>

        <SectionLabel>앱 정보</SectionLabel>
        <SettingRow label="버전" right={<Text style={{ color: c.textSecondary, fontFamily: fontCute }}>1.0.0</Text>} />
      </ScrollView>

      <Modal visible={timePickerOpen} transparent animationType="fade" onRequestClose={() => setTimePickerOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' }} onPress={() => setTimePickerOpen(false)}>
          <Pressable onPress={() => {}} style={{ backgroundColor: c.surface, borderRadius: 20, padding: 24, width: 280, borderWidth: 1, borderColor: c.border, boxShadow: '0 6px 20px rgba(0,0,0,0.15)', elevation: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
              <Ionicons name="alarm-outline" size={20} color={c.textPrimary} />
              <Text style={{ color: c.textPrimary, fontSize: 17 * fs, fontWeight: '800', textAlign: 'center', fontFamily: fontCute }}>알림 시간 설정</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 20 }}>
              <View style={{ alignItems: 'center' }}>
                <Pressable onPress={() => setEditH((editH + 1) % 24)} style={{ padding: 8 }}>
                  <Ionicons name="chevron-up" size={20} color={c.textPrimary} />
                </Pressable>
                <Text style={{ color: c.textPrimary, fontSize: 36, fontWeight: '800', fontFamily: fontMono, paddingVertical: 8 }}>
                  {String(editH).padStart(2, '0')}
                </Text>
                <Pressable onPress={() => setEditH((editH + 23) % 24)} style={{ padding: 8 }}>
                  <Ionicons name="chevron-down" size={20} color={c.textPrimary} />
                </Pressable>
              </View>
              <Text style={{ color: c.textSecondary, fontSize: 28, fontWeight: '800' }}>:</Text>
              <View style={{ alignItems: 'center' }}>
                <Pressable onPress={() => setEditM((editM + 1) % 60)} style={{ padding: 8 }}>
                  <Ionicons name="chevron-up" size={20} color={c.textPrimary} />
                </Pressable>
                <Text style={{ color: c.textPrimary, fontSize: 36, fontWeight: '800', fontFamily: fontMono, paddingVertical: 8 }}>
                  {String(editM).padStart(2, '0')}
                </Text>
                <Pressable onPress={() => setEditM((editM + 59) % 60)} style={{ padding: 8 }}>
                  <Ionicons name="chevron-down" size={20} color={c.textPrimary} />
                </Pressable>
              </View>
            </View>
            <Button label="저장" variant="filled" onPress={saveTime} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
