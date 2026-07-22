import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontDisplay, fontBody } from '../../theme/tokens';
import { Switch } from '../ui/Switch';
import { useNotificationStore, NOTIFICATION_TYPE_META, type NotificationType } from '../../store/notificationStore';

/** 종류별 대표 알림 예시 — 사용자가 "이런 알림"이 무엇인지 보고 on/off 판단. */
const SAMPLE: Record<NotificationType, string> = {
  remind: '지금 복습할 카드 5장이 있어요',
  new: '새 소방 학습 카드가 추가되었어요',
  achievement: '연속 학습 5일 달성! 🔥',
  system: '현장학습 업데이트 소식이 도착했어요',
};

/** 예시 알림을 보여주며 해당 종류를 켜고 끄는 카드. */
export function NotificationPreviewToggle({ type }: { type: NotificationType }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const meta = NOTIFICATION_TYPE_META[type];
  const muted = useNotificationStore((s) => s.mutedTypes[type]);
  const setMute = useNotificationStore((s) => s.setMute);

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: muted ? c.border : meta.color + '44' }]}>
      <View style={[styles.iconTile, { backgroundColor: meta.color + '1A', opacity: muted ? 0.5 : 1 }]}>
        <Ionicons name={meta.icon} size={18} color={meta.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: meta.color, fontSize: 11, fontFamily: fontDisplay, opacity: muted ? 0.6 : 1 }}>{meta.label}</Text>
        <Text numberOfLines={1} style={{ color: muted ? c.textSecondary : c.textPrimary, fontSize: 13.5, marginTop: 2, fontFamily: fontDisplay, textDecorationLine: muted ? 'line-through' : 'none' }}>
          {SAMPLE[type]}
        </Text>
        <Text style={{ color: c.textSecondary, fontSize: 11, marginTop: 3, fontFamily: fontBody }}>
          {muted ? '이런 알림을 받지 않아요' : '이런 알림을 받아요'}
        </Text>
      </View>
      <Switch value={!muted} onValueChange={(v) => setMute(type, !v)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 8 },
  iconTile: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
