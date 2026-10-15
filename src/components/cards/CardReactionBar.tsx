import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontBody } from '../../theme/tokens';
import { useLikeStore } from '../../store/likeStore';
import { useBookmarkStore } from '../../store/bookmarkStore';
import { useReportStore } from '../../store/reportStore';
import { hapticTap } from '../../utils/haptics';

/** 카드 ID로 기존 동기화 저장소를 구독하므로 화면/카드 전환에도 상태가 유지된다. */
export function CardReactionBar({ cardId, onReport, disabled = false }: { cardId: string; onReport: () => void; disabled?: boolean }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const liked = useLikeStore(s => s.ids.includes(cardId));
  const saved = useBookmarkStore(s => s.ids.includes(cardId));
  const reported = useReportStore(s => s.hasReported(cardId));
  const items = [
    { label: '좋아요', active: liked, color: c.error, icon: liked ? 'heart' : 'heart-outline', action: () => useLikeStore.getState().toggle(cardId) },
    { label: '저장', active: saved, color: c.primary, icon: saved ? 'bookmark' : 'bookmark-outline', action: () => useBookmarkStore.getState().toggle(cardId) },
    { label: reported ? '신고됨' : '신고', active: reported, color: c.warning, icon: reported ? 'flag' : 'flag-outline', action: onReport },
  ] as const;
  return (
    <View testID="card-reactions" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
      {items.map(item => (
        <Pressable key={item.icon} accessibilityRole="button" accessibilityState={{ selected: item.active, disabled }}
          aria-pressed={item.label === '신고' || item.label === '신고됨' ? undefined : item.active}
          accessibilityLabel={item.active && item.label !== '신고됨' ? `${item.label} 취소` : item.label}
          disabled={disabled} onPress={event => { event.stopPropagation(); hapticTap(); item.action(); }}
          style={{ flexGrow: 1, flexBasis: 80, minHeight: 44, padding: 8, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, borderRadius: 12, backgroundColor: item.active ? item.color + '18' : c.surfaceAlt, opacity: disabled ? 0.5 : 1 }}>
          <Ionicons name={item.icon} size={17} color={item.active ? item.color : c.textSecondary} />
          <Text style={{ color: item.active ? item.color : c.textSecondary, fontSize: 13 * fs, fontFamily: fontBody }}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
