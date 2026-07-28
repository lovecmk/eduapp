import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, fontMono, fontDisplay, fontBody } from '../../theme/tokens';
import { useReview } from '../../hooks/useReview';
import { useSrsStore, boxDistribution } from '../../store/srsStore';
import { BOX_META } from '../../domain/srs';
import { ROUTES } from '../../constants/routes';
import { UpcomingSchedule } from './UpcomingSchedule';

/** 통계 화면의 간격 반복 복습 현황 — 지금 볼 만한 카드, 기억 강도 분포, 앞으로의 분포. */
export function ReviewStatusCard() {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const { dueTodayCount, upcoming } = useReview();
  const srsCards = useSrsStore((s) => s.cards);

  const dist = useMemo(() => boxDistribution(srsCards), [srsCards]);
  const total = dist.reduce((a, b) => a + b, 0);
  const mastered = dist[4] + dist[5];
  const strengthPct = total > 0 ? Math.round((dist.reduce((sum, n, i) => sum + n * i, 0) / (total * 5)) * 100) : 0;

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="repeat" size={16} color={c.primary} />
          <Text style={[styles.title, { color: c.textPrimary }]}>복습 현황 (간격 반복)</Text>
        </View>
        <View style={[styles.strengthChip, { backgroundColor: c.success + '18' }]}>
          <Ionicons name="pulse" size={12} color={c.success} />
          <Text style={[styles.strengthText, { color: c.success }]}>기억 강도 {strengthPct}%</Text>
        </View>
      </View>

      {/* 오늘 복습 CTA */}
      <Pressable accessibilityRole="button"
        onPress={() => router.push(ROUTES.review)}
        style={[styles.cta, { backgroundColor: dueTodayCount > 0 ? c.primary : c.surfaceAlt, borderColor: c.border }]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={[styles.ctaIcon, { backgroundColor: dueTodayCount > 0 ? 'rgba(255,255,255,0.2)' : c.surface }]}>
            <Ionicons name="albums" size={18} color={dueTodayCount > 0 ? '#fff' : c.textSecondary} />
          </View>
          <View>
            <Text style={{ color: dueTodayCount > 0 ? '#fff' : c.textPrimary, fontSize: 14, fontFamily: fontDisplay }}>
              {/* '완료 상태'라고 하면 복습이 끝내야 할 일이 되고, 안 한 날은 미완이 된다. */}
              {dueTodayCount > 0 ? '지금 보기 좋은 카드가 있어요' : '지금은 쉬어도 좋아요'}
            </Text>
            <Text style={{ color: dueTodayCount > 0 ? 'rgba(255,255,255,0.85)' : c.textSecondary, fontSize: 11.5, fontFamily: fontBody, marginTop: 1 }}>
              지금 볼 만한 {dueTodayCount}장 · 마스터 {mastered}장
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={dueTodayCount > 0 ? '#fff' : c.textSecondary} />
      </Pressable>

      {/* 기억 강도 분포(Leitner 박스) */}
      <Text style={[styles.subLabel, { color: c.textSecondary }]}>기억 강도 분포</Text>
      <View style={[styles.distBar, { backgroundColor: c.surfaceAlt }]}>
        {dist.map((n, i) => (
          n > 0 ? <View key={i} style={{ flex: n, backgroundColor: BOX_META[i].color }} /> : null
        ))}
      </View>
      <View style={styles.legendRow}>
        {BOX_META.map((m, i) => (
          <View key={i} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: m.color }]} />
            <Text style={[styles.legendText, { color: c.textSecondary }]}>{m.label} {dist[i]}</Text>
          </View>
        ))}
      </View>

      <View style={{ height: 14 }} />
      <UpcomingSchedule days={upcoming} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, borderWidth: 1, padding: 16, marginBottom: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { fontSize: 15, fontFamily: fontDisplay },
  strengthChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  strengthText: { fontSize: 11, fontFamily: fontDisplay },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 18 },
  ctaIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  subLabel: { fontSize: 12, marginBottom: 8, fontFamily: fontBody },
  distBar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', marginBottom: 10 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10.5, fontFamily: fontMono },
});
