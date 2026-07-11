import React from 'react';
import { View, Text, Pressable, Image, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedSheet } from './AnimatedSheet';
import { useTheme } from '../../theme/ThemeProvider';
import { fontDisplay, fontBody, fontMono } from '../../theme/tokens';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore, type ThemeMode } from '../../store/settingsStore';
import { useNotificationStore } from '../../store/notificationStore';
import { MEMBERSHIP_META } from '../../domain/models/User';
import { ROUTES } from '../../constants/routes';

type IconName = keyof typeof Ionicons.glyphMap;

// 하단 탭(홈/학습카드/복습/통계/마이페이지)과 중복되지 않는 보조 목적지만 노출.
const SHORTCUTS: { label: string; icon: IconName; route: string; key: string }[] = [
  { label: '학습 목표', icon: 'flag', route: ROUTES.contents, key: 'contents' },
  { label: '알림', icon: 'notifications', route: ROUTES.notifications, key: 'notifications' },
  { label: '설정', icon: 'settings-sharp', route: ROUTES.settings, key: 'settings' },
];

const THEMES: { key: ThemeMode; label: string; icon: IconName }[] = [
  { key: 'light', label: '라이트', icon: 'sunny' },
  { key: 'dark', label: '다크', icon: 'moon' },
  { key: 'dim', label: '딤', icon: 'contrast' },
  { key: 'system', label: '시스템', icon: 'phone-portrait' },
];

/** 헤더 메뉴 바텀시트 — 프로필 + 보조 바로가기 + 빠른 테마 전환. */
export function HeaderMenuSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const profileImage = useSettingsStore((s) => s.profileImage);
  const themeMode = useSettingsStore((s) => s.themeMode);
  const setThemeMode = useSettingsStore((s) => s.setThemeMode);
  const unread = useNotificationStore((s) => s.unreadCount());
  const meta = user ? MEMBERSHIP_META[user.membership] : null;

  const go = (route: string) => { onClose(); setTimeout(() => router.push(route as never), 180); };

  return (
    <AnimatedSheet visible={visible} onClose={onClose} rounded={26}>
        <View style={{ paddingHorizontal: 20 }}>
          {/* 프로필 */}
          {user && (
            <Pressable onPress={() => go(ROUTES.mypage)} style={[styles.profile, { backgroundColor: c.surface, borderColor: c.border }]}>
              {profileImage ? (
                <Image source={{ uri: profileImage }} style={[styles.avatar, { borderColor: meta?.accent ?? c.primary }]} />
              ) : (
                <View style={[styles.avatarFallback, { backgroundColor: c.primary }]}>
                  <Text style={styles.avatarLetter}>{user.name.charAt(0)}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ color: c.textPrimary, fontSize: 16, fontFamily: fontDisplay }} numberOfLines={1}>{user.name}</Text>
                  {meta && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: meta.accent + '1A', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 }}>
                      <Ionicons name={meta.icon as IconName} size={10} color={meta.accent} />
                      <Text style={{ color: meta.accent, fontSize: 10.5, fontFamily: fontDisplay }}>{meta.label}</Text>
                    </View>
                  )}
                </View>
                <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 2, fontFamily: fontBody }}>내 정보 보기</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.textSecondary} />
            </Pressable>
          )}

          {/* 바로가기 */}
          <View style={styles.grid}>
            {SHORTCUTS.map((s) => (
              <Pressable key={s.key} onPress={() => go(s.route)} style={[styles.tile, { backgroundColor: c.surface, borderColor: c.border }]}>
                <View style={[styles.tileIcon, { backgroundColor: c.primary + '14' }]}>
                  <Ionicons name={s.icon} size={20} color={c.primary} />
                  {s.key === 'notifications' && unread > 0 && (
                    <View style={[styles.badge, { backgroundColor: c.error }]}>
                      <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
                    </View>
                  )}
                </View>
                <Text style={{ color: c.textPrimary, fontSize: 12.5, fontFamily: fontDisplay, marginTop: 8 }}>{s.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* 빠른 테마 */}
          <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>화면 테마</Text>
          <View style={styles.themeRow}>
            {THEMES.map((t) => {
              const active = themeMode === t.key;
              return (
                <Pressable key={t.key} onPress={() => setThemeMode(t.key)}
                  style={[styles.themeChip, { backgroundColor: active ? c.primary : c.surface, borderColor: active ? c.primary : c.border }]}>
                  <Ionicons name={t.icon} size={14} color={active ? '#fff' : c.textSecondary} />
                  <Text style={{ color: active ? '#fff' : c.textSecondary, fontSize: 11.5, fontFamily: fontDisplay }}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
    </AnimatedSheet>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, padding: 12, marginBottom: 14 },
  avatar: { width: 46, height: 46, borderRadius: 23, borderWidth: 2 },
  avatarFallback: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: '#fff', fontSize: 19, fontFamily: fontDisplay },
  grid: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  tile: { flex: 1, borderRadius: 16, borderWidth: 1, paddingVertical: 16, alignItems: 'center' },
  tileIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -4, right: -6, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 9.5, fontFamily: fontMono, fontWeight: '800' },
  sectionLabel: { fontSize: 11.5, fontFamily: fontDisplay, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginLeft: 2 },
  themeRow: { flexDirection: 'row', gap: 8 },
  themeChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 9, borderRadius: 12, borderWidth: 1 },
});
