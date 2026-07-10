import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, fontDisplay, fontBody } from '../../theme/tokens';
import { getCategoryColor, getCategoryIcon } from '../../constants/categories';
import { getTodayTip } from '../../constants/safetyTips';
import { ROUTES } from '../../constants/routes';

/** 오늘의 안전 상식 — 매일 바뀌는 짧은 교육 콘텐츠로 추가 학습·복귀를 유도. */
export function DailyTipCard() {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const tip = getTodayTip();
  const accent = getCategoryColor(tip.category) ?? c.primary;

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="bulb" size={16} color={c.warning} />
          <Text style={{ color: c.textPrimary, fontSize: 14, fontFamily: fontDisplay }}>오늘의 안전 상식</Text>
        </View>
        <View style={[styles.chip, { backgroundColor: accent + '18' }]}>
          <Ionicons name={getCategoryIcon(tip.category)} size={11} color={accent} />
          <Text style={{ color: accent, fontSize: 11, fontFamily: fontDisplay }}>{tip.category}</Text>
        </View>
      </View>

      <Text style={{ color: c.textPrimary, fontSize: 15, lineHeight: 22, fontFamily: fontDisplay, marginBottom: 6 }}>{tip.title}</Text>
      <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 20, fontFamily: fontBody }}>{tip.body}</Text>

      <Pressable onPress={() => router.push(ROUTES.contents)} style={[styles.more, { borderTopColor: c.border }]}>
        <Text style={{ color: c.primary, fontSize: 12.5, fontFamily: fontDisplay }}>관련 학습 더 보기</Text>
        <Ionicons name="arrow-forward" size={14} color={c.primary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, borderWidth: 1, padding: 16, marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 14, paddingTop: 12, borderTopWidth: 1 },
});
