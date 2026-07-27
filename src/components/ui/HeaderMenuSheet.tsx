import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedSheet } from './AnimatedSheet';
import { Avatar } from './Avatar';
import { AchievementBadge } from './AchievementBadge';
import { useTheme } from '../../theme/ThemeProvider';
import { fontDisplay, fontBody, fontMono } from '../../theme/tokens';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore, type ThemeMode } from '../../store/settingsStore';
import { useNotificationStore } from '../../store/notificationStore';
import { MEMBERSHIP_META } from '../../domain/models/User';
import { ROUTES } from '../../constants/routes';

type IconName = keyof typeof Ionicons.glyphMap;

// 하단 탭(홈/학습/복습/커뮤니티/마이페이지)과 중복되지 않는 보조 목적지만 노출.
const SHORTCUTS: { label: string; icon: IconName; route: string; key: string }[] = [
  { label: '통계', icon: 'bar-chart', route: ROUTES.stats, key: 'stats' },
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
  const logout = useAuthStore((s) => s.logout);
  const profileImage = useSettingsStore((s) => s.profileImage);
  const themeMode = useSettingsStore((s) => s.themeMode);
  const setThemeMode = useSettingsStore((s) => s.setThemeMode);
  const unread = useNotificationStore((s) => s.unreadCount());
  const meta = user ? MEMBERSHIP_META[user.membership] : null;

  // 시트가 닫히는 애니메이션(180ms)이 끝난 뒤 이동해야 화면이 겹쳐 보이지 않는다.
  // 다만 그 사이 사용자가 다른 항목을 또 누르면 두 화면이 연달아 쌓이므로 한 번만 받는다.
  const navLockRef = useRef(false);
  // 예약해 둔 이동. 시트가 사라지면 취소해야 한다 — 안 그러면 사용자가 뒤로 가기로
  // 빠져나간 뒤에 예약된 push 가 뒤늦게 터져 엉뚱한 화면이 열린다.
  const navTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) navLockRef.current = false; // 시트가 다시 열리면 잠금 해제
  }, [visible]);

  useEffect(
    () => () => {
      if (navTimer.current) clearTimeout(navTimer.current);
    },
    [],
  );

  /** 시트를 닫고, 닫힘 애니메이션이 끝나면 fn 을 한 번 실행한다. */
  const afterClose = (fn: () => void) => {
    if (navLockRef.current) return;
    navLockRef.current = true;
    onClose();
    if (navTimer.current) clearTimeout(navTimer.current);
    navTimer.current = setTimeout(fn, 180);
  };

  const go = (route: string) => afterClose(() => router.push(route as never));

  const onLogout = () =>
    afterClose(async () => {
      // 로그아웃이 실패해도(토큰 폐기 요청 실패 등) 로컬 세션은 이미 정리된다.
      // 여기서 예외를 삼키지 않으면 unhandled rejection 이 되고, 사용자는
      // 로그아웃을 눌렀는데 아무 일도 일어나지 않는 화면에 갇힌다.
      try {
        await logout();
      } catch {
        /* 서버 통지 실패는 무시하고 로그인 화면으로 보낸다 */
      }
      router.replace(ROUTES.login as never);
    });

  return (
    <AnimatedSheet visible={visible} onClose={onClose} rounded={26}>
        <View style={{ paddingHorizontal: 20 }}>
          {/* 프로필 */}
          {user && (
            <Pressable onPress={() => go(ROUTES.profile)} style={[styles.profile, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Avatar uri={profileImage} size={46} ring={2} ringColor={meta?.accent ?? c.primary} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ color: c.textPrimary, fontSize: 16, fontFamily: fontDisplay }} numberOfLines={1}>{user.name}</Text>
                  <AchievementBadge size={15} />
                  {meta && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: meta.accent + '1A', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 }}>
                      <Ionicons name={meta.icon as IconName} size={10} color={meta.accent} />
                      <Text style={{ color: meta.accent, fontSize: 10.5, fontFamily: fontDisplay }}>{meta.label}</Text>
                    </View>
                  )}
                </View>
                <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 2, fontFamily: fontBody }}>내 프로필 보기</Text>
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

          {/* 로그아웃 */}
          {user && (
            <Pressable
              onPress={onLogout}
              style={[styles.logout, { backgroundColor: c.surface, borderColor: c.error + '55' }]}
            >
              <Ionicons name="log-out-outline" size={18} color={c.error} />
              <Text style={{ color: c.error, fontSize: 14, fontFamily: fontDisplay }}>로그아웃</Text>
            </Pressable>
          )}
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
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 18, paddingVertical: 14, borderRadius: 14, borderWidth: 1 },
});
