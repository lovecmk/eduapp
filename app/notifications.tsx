import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/ThemeProvider';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { ErrorState } from '../src/components/ui/ErrorState';
import { fontCute } from '../src/theme/tokens';
import { useNotificationStore, type NotificationType } from '../src/store/notificationStore';

const TYPE_ICON: Record<NotificationType, keyof typeof Ionicons.glyphMap> = {
  new: 'book',
  remind: 'alarm',
  achievement: 'trophy',
  system: 'construct',
};

const INITIAL_COUNT = 7;

export default function NotificationsScreen() {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  const fs = fontScale;
  const items = useNotificationStore((s) => s.items);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const [showAll, setShowAll] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    markAllRead();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 800));
    setRefreshing(false);
  }, []);

  const displayed = showAll ? items : items.slice(0, INITIAL_COUNT);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title="알림" />

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
        contentContainerStyle={{ padding: 20, flexGrow: 1 }}
      >
        {items.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 }}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>🔔</Text>
            <Text style={{ color: c.textSecondary, fontSize: 15 * fs, fontFamily: fontCute, textAlign: 'center' }}>아직 알림이 없어요</Text>
          </View>
        ) : (
          <>
            {displayed.map((n) => (
              <View key={n.id} style={{ flexDirection: 'row', alignItems: 'flex-start', backgroundColor: c.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: c.border }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                  <Ionicons name={TYPE_ICON[n.type]} size={17} color={c.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: c.textPrimary, fontSize: 14 * fs, fontWeight: '700', flex: 1, fontFamily: fontCute }}>{n.title}</Text>
                    <Text style={{ color: c.textSecondary, fontSize: 10, marginLeft: 8 }}>{n.time}</Text>
                  </View>
                  <Text style={{ color: c.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 4 }}>{n.desc}</Text>
                </View>
              </View>
            ))}

            {!showAll && items.length > INITIAL_COUNT && (
              <Pressable onPress={() => setShowAll(true)}
                style={{ backgroundColor: c.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: c.border, alignItems: 'center' }}>
                <Text style={{ color: c.primary, fontWeight: '700', fontSize: 13, fontFamily: fontCute }}>더보기 ({items.length - INITIAL_COUNT}개)</Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
