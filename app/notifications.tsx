import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeIn, LinearTransition } from 'react-native-reanimated';
import { useTheme } from '../src/theme/ThemeProvider';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { CenterModal } from '../src/components/ui/CenterModal';
import { AnimatedSheet } from '../src/components/ui/AnimatedSheet';
import { Button } from '../src/components/ui/Button';
import { ROUTES } from '../src/constants/routes';
import { fontDisplay, fontBody, fontMono } from '../src/theme/tokens';
import {
  useNotificationStore, NOTIFICATION_TYPE_META, timeAgoLabel, timeGroup,
  type NotificationType, type AppNotification, type TimeGroup,
} from '../src/store/notificationStore';
import { contentColumn } from '../src/theme/layout';
import { useSafeTimeout, useIsMounted } from '../src/hooks/useSafeTimeout';
import { pullNotifications } from '../src/hooks/useNotificationSync';
import { toast } from '../src/store/toastStore';

// 알림 종류별 연결 서비스 — 항목을 누르면 해당 화면으로 이동한다.
const ROUTE_BY_TYPE: Record<NotificationType, string> = {
  remind: ROUTES.review,       // 복습 리마인더 → 복습 화면
  new: ROUTES.contents,        // 새 컨텐츠 → 전체 컨텐츠
  achievement: ROUTES.trophy,  // 성취·보상 → 트로피
  system: ROUTES.settings,     // 공지·시스템 → 설정(업데이트 내역)
};

const FILTERS: { key: 'all' | NotificationType; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'remind', label: '리마인더' },
  { key: 'new', label: '새 컨텐츠' },
  { key: 'achievement', label: '성취' },
  { key: 'system', label: '공지' },
];

export default function NotificationsScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();

  const items = useNotificationStore((s) => s.items);
  const mutedTypes = useNotificationStore((s) => s.mutedTypes);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const markRead = useNotificationStore((s) => s.markRead);
  const remove = useNotificationStore((s) => s.remove);
  const clearAll = useNotificationStore((s) => s.clearAll);
  const setMute = useNotificationStore((s) => s.setMute);

  const [filter, setFilter] = useState<'all' | NotificationType>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [sheetItem, setSheetItem] = useState<AppNotification | null>(null);
  const [muteTarget, setMuteTarget] = useState<NotificationType | null>(null);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);
  const [headerMenu, setHeaderMenu] = useState(false);
  const { run } = useSafeTimeout();
  const alive = useIsMounted();

  const onRefresh = async () => {
    if (refreshing) return; // 연타로 새로고침이 겹치지 않게
    setRefreshing(true);
    const ok = await pullNotifications();
    if (!alive()) return;
    setRefreshing(false);
    if (!ok) toast('알림을 새로 받아 오지 못했어요. 연결을 확인해 주세요.', 'warn');
  };

  // 알림 항목 탭 — 읽음 처리 후 종류에 맞는 서비스 화면으로 이동한다.
  const openNotification = (n: AppNotification) => {
    markRead(n.id);
    const route = ROUTE_BY_TYPE[n.type];
    if (route === ROUTES.review) router.navigate(ROUTES.review);
    else if (route) router.push(route as never);
  };

  const filtered = useMemo(
    () => (filter === 'all' ? items : items.filter((n) => n.type === filter)),
    [items, filter],
  );

  // 시간대별 그룹핑
  const groups = useMemo(() => {
    const map: Record<TimeGroup, AppNotification[]> = { '오늘': [], '이번 주': [], '이전': [] };
    for (const n of filtered) map[timeGroup(n.minutesAgo)].push(n);
    return (['오늘', '이번 주', '이전'] as TimeGroup[]).map((g) => ({ group: g, items: map[g] })).filter((s) => s.items.length > 0);
  }, [filtered]);

  // 스마트 제안: 안 읽은 알림이 가장 많은(2개+) 종류를 추천
  const suggestion = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const n of items) if (!n.read && !mutedTypes[n.type]) counts[n.type] = (counts[n.type] ?? 0) + 1;
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return top && top[1] >= 2 ? { type: top[0] as NotificationType, count: top[1] } : null;
  }, [items, mutedTypes]);

  const mutedList = (Object.keys(mutedTypes) as NotificationType[]).filter((t) => mutedTypes[t]);
  const mutedFilterCount = filtered.length;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader
        title="알림"
        right={
          <Pressable onPress={() => setHeaderMenu(true)} hitSlop={8} style={{ padding: 4 }} accessibilityRole="button" accessibilityLabel="알림 메뉴 열기">
            <Ionicons name="ellipsis-horizontal" size={20} color={c.textPrimary} />
          </Pressable>
        }
      />

      {/* 필터 칩 */}
      <View style={{ borderBottomWidth: 1, borderBottomColor: c.border }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
          {FILTERS.map((f) => {
            const active = f.key === filter;
            const unread = f.key === 'all'
              ? items.filter((n) => !n.read).length
              : items.filter((n) => n.type === f.key && !n.read).length;
            return (
              <Pressable accessibilityRole="button" key={f.key} onPress={() => setFilter(f.key)}
                style={[styles.chip, { backgroundColor: active ? c.primary : c.surfaceAlt, borderColor: active ? c.primary : c.border }]}>
                <Text style={{ color: active ? c.textOnPrimary : c.textSecondary, fontSize: 12.5 * fs, fontFamily: fontDisplay }}>{f.label}</Text>
                {unread > 0 && (
                  <View style={[styles.chipBadge, { backgroundColor: active ? 'rgba(255,255,255,0.3)' : c.error }]}>
                    <Text style={{ color: '#fff', fontSize: 10, fontFamily: fontMono, fontWeight: '800' }}>{unread}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
        contentContainerStyle={{ padding: 20, paddingBottom: 40, flexGrow: 1, ...contentColumn }}
      >
        {/* 스마트 제안 배너 */}
        {suggestion && !suggestionDismissed && (
          <Animated.View entering={FadeInDown.duration(300)} style={[styles.suggestion, { backgroundColor: c.primary + '12', borderColor: c.primary + '33' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Ionicons name="bulb" size={16} color={c.primary} />
              <Text style={{ color: c.textPrimary, fontSize: 13.5 * fs, fontFamily: fontDisplay, flex: 1 }}>
                이런 알림, 자주 오지 않나요?
              </Text>
            </View>
            <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, lineHeight: 19, fontFamily: fontBody, marginBottom: 12 }}>
              최근 <Text style={{ color: c.primary, fontFamily: fontDisplay }}>{NOTIFICATION_TYPE_META[suggestion.type].label}</Text> 알림을 {suggestion.count}건 받았어요.
              이런 알림을 끄고 싶으세요?
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable accessibilityRole="button" onPress={() => setMuteTarget(suggestion.type)} style={[styles.sgBtn, { backgroundColor: c.primary }]}>
                <Text style={{ color: c.textOnPrimary, fontSize: 12.5, fontFamily: fontDisplay }}>이런 알림 끄기</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => setSuggestionDismissed(true)} style={[styles.sgBtn, { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }]}>
                <Text style={{ color: c.textSecondary, fontSize: 12.5, fontFamily: fontDisplay }}>괜찮아요</Text>
              </Pressable>
            </View>
          </Animated.View>
        )}

        {/* 꺼진 알림 안내 */}
        {mutedList.length > 0 && (
          <Animated.View entering={FadeIn} style={[styles.mutedBar, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
            <Ionicons name="notifications-off" size={15} color={c.textSecondary} />
            <Text style={{ color: c.textSecondary, fontSize: 12 * fs, flex: 1, fontFamily: fontBody }}>
              {mutedList.map((t) => NOTIFICATION_TYPE_META[t].label).join(', ')} 알림이 꺼져 있어요
            </Text>
            <Pressable accessibilityRole="button" onPress={() => mutedList.forEach((t) => setMute(t, false))} hitSlop={6}>
              <Text style={{ color: c.primary, fontSize: 12 * fs, fontFamily: fontDisplay }}>모두 켜기</Text>
            </Pressable>
          </Animated.View>
        )}

        {mutedFilterCount === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 }}>
            <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <Ionicons name="notifications-outline" size={34} color={c.textSecondary} />
            </View>
            <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontFamily: fontDisplay }}>새로운 알림이 없어요</Text>
            <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, marginTop: 6, fontFamily: fontBody }}>모두 확인하셨어요 👍</Text>
          </View>
        ) : (
          groups.map((section) => (
            <View key={section.group} style={{ marginBottom: 8 }}>
              <Text style={[styles.groupLabel, { color: c.textSecondary }]}>{section.group}</Text>
              {section.items.map((n, i) => {
                const meta = NOTIFICATION_TYPE_META[n.type];
                const muted = mutedTypes[n.type];
                return (
                  <Animated.View key={n.id} entering={FadeInDown.delay(i * 40).duration(320)} layout={LinearTransition.springify()}>
                    {/* 항목 본문과 '⋮' 메뉴는 **형제**여야 한다. 예전엔 메뉴가 본문 Pressable
                        안에 들어 있었는데, 웹(react-native-web)에서는 둘 다 <button> 으로
                        렌더되어 버튼 안에 버튼이 생긴다 — 유효하지 않은 DOM 이고, 스크린
                        리더는 중첩된 컨트롤을 제대로 읽어 주지 못한다. */}
                    <View style={[styles.item, { backgroundColor: c.surface, borderColor: n.read ? c.border : meta.color + '55' }]}>
                      <Pressable accessibilityRole="button"
                        onPress={() => openNotification(n)}
                        style={styles.itemMain}
                      >
                        <View style={[styles.itemIcon, { backgroundColor: meta.color + '1A' }]}>
                          <Ionicons name={meta.icon} size={18} color={meta.color} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text numberOfLines={1} style={{ color: c.textPrimary, fontSize: 13.5 * fs, fontFamily: fontDisplay, flex: 1 }}>{n.title}</Text>
                            {!n.read && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: meta.color }} />}
                          </View>
                          <Text numberOfLines={2} style={{ color: c.textSecondary, fontSize: 12 * fs, lineHeight: 17, marginTop: 3, fontFamily: fontBody }}>{n.desc}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                            <Text style={{ color: c.textSecondary, fontSize: 10.5, fontFamily: fontMono }}>{timeAgoLabel(n.minutesAgo)}</Text>
                            {muted && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                <Ionicons name="notifications-off" size={10} color={c.textSecondary} />
                                <Text style={{ color: c.textSecondary, fontSize: 10, fontFamily: fontBody }}>꺼짐</Text>
                              </View>
                            )}
                          </View>
                        </View>
                      </Pressable>
                      <Pressable onPress={() => setSheetItem(n)} hitSlop={8} style={{ padding: 4, marginLeft: 4 }} accessibilityRole="button" accessibilityLabel="이 알림 메뉴">
                        <Ionicons name="ellipsis-vertical" size={16} color={c.textSecondary} />
                      </Pressable>
                    </View>
                  </Animated.View>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>

      {/* 헤더 메뉴 */}
      <ActionSheet visible={headerMenu} onClose={() => setHeaderMenu(false)} title="알림 관리">
        {/* 알림 수신 설정을 홈 알림 화면 한곳에서 관리(꼭 필요한 성취·공지만). */}
        <SheetRow icon="trophy-outline" label={`성취 알림 ${mutedTypes.achievement ? '켜기' : '끄기'}`} onPress={() => setMute('achievement', !mutedTypes.achievement)} />
        <SheetRow icon="megaphone-outline" label={`공지 알림 ${mutedTypes.system ? '켜기' : '끄기'}`} onPress={() => setMute('system', !mutedTypes.system)} />
        <SheetRow icon="checkmark-done" label="모두 읽음 처리" onPress={() => { markAllRead(); setHeaderMenu(false); }} />
        <SheetRow icon="trash-outline" label="전체 삭제" destructive onPress={() => { clearAll(); setHeaderMenu(false); }} />
      </ActionSheet>

      {/* 항목 액션 시트 — 이런 알림 끄기 */}
      <ActionSheet
        visible={sheetItem !== null}
        onClose={() => setSheetItem(null)}
        title={sheetItem ? NOTIFICATION_TYPE_META[sheetItem.type].label : ''}
        subtitle={sheetItem ? NOTIFICATION_TYPE_META[sheetItem.type].desc : ''}
      >
        {sheetItem && (
          <>
            <SheetRow icon="checkmark-circle-outline" label="읽음으로 표시" onPress={() => { markRead(sheetItem.id); setSheetItem(null); }} />
            <SheetRow icon="trash-outline" label="이 알림 삭제" onPress={() => { remove(sheetItem.id); setSheetItem(null); }} />
            <SheetRow
              icon="notifications-off-outline"
              label="이런 알림 끄기"
              highlight
              onPress={() => { const t = sheetItem.type; setSheetItem(null); run(() => setMuteTarget(t), 150); }}
            />
          </>
        )}
      </ActionSheet>

      {/* 끄기 확인 모달 — "이런 알람을 끄고 싶으세요?" */}
      <CenterModal visible={muteTarget !== null} onClose={() => setMuteTarget(null)} title="이런 알림 끄기" icon="notifications-off-outline">
        {muteTarget && (
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: NOTIFICATION_TYPE_META[muteTarget].color + '1A', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <Ionicons name={NOTIFICATION_TYPE_META[muteTarget].icon} size={28} color={NOTIFICATION_TYPE_META[muteTarget].color} />
            </View>
            <Text style={{ color: c.textPrimary, fontSize: 16 * fs, fontFamily: fontDisplay, marginBottom: 8, textAlign: 'center' }}>
              {NOTIFICATION_TYPE_META[muteTarget].label} 알림을 끌까요?
            </Text>
            <Text style={{ color: c.textSecondary, fontSize: 13 * fs, textAlign: 'center', lineHeight: 20, marginBottom: 22, fontFamily: fontBody }}>
              {NOTIFICATION_TYPE_META[muteTarget].desc} 알림을{'\n'}더 이상 받지 않아요. 언제든 다시 켤 수 있어요.
            </Text>
            <Button label="이런 알림 끄기" colorOverride={c.error} onPress={() => { setMute(muteTarget, true); setMuteTarget(null); setSuggestionDismissed(true); }} style={{ width: '100%' }} />
            <Pressable accessibilityRole="button" onPress={() => setMuteTarget(null)} style={{ paddingVertical: 14 }}>
              <Text style={{ color: c.textSecondary, fontFamily: fontDisplay }}>유지하기</Text>
            </Pressable>
          </View>
        )}
      </CenterModal>
    </View>
  );
}

/** 하단 액션 시트. */
function ActionSheet({
  visible, onClose, title, subtitle, children,
}: { visible: boolean; onClose: () => void; title: string; subtitle?: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <AnimatedSheet visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: 20, paddingBottom: 6 }}>
        <Text style={{ color: c.textPrimary, fontSize: 15, fontFamily: fontDisplay }}>{title}</Text>
        {subtitle ? <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 2, fontFamily: fontBody }}>{subtitle}</Text> : null}
        <View style={{ marginTop: 14, gap: 2 }}>{children}</View>
      </View>
    </AnimatedSheet>
  );
}

function SheetRow({ icon, label, onPress, destructive, highlight }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; destructive?: boolean; highlight?: boolean }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const color = destructive ? c.error : highlight ? c.primary : c.textPrimary;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 4 }}>
      <Ionicons name={icon} size={19} color={color} />
      <Text style={{ color, fontSize: 14.5, fontFamily: fontDisplay }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  chipBadge: { minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  suggestion: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 14 },
  sgBtn: { flex: 1, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  mutedBar: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14 },
  groupLabel: { fontSize: 12, fontFamily: fontDisplay, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginLeft: 2 },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 8 },
  /** 항목 본문(아이콘+텍스트) — 바깥 카드가 아니라 이쪽이 '알림 열기' 버튼이다. */
  itemMain: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  itemIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 20, paddingBottom: 34 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
});
