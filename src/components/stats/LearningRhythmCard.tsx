import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, fontDisplay, fontBody, fontMono } from '../../theme/tokens';
import { useSrsStore } from '../../store/srsStore';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 학습 리듬 카드 — 캘린더에 누적된 학습/복습 데이터를 요일 패턴·장기 통계로 재해석.
 * 데이터가 수개월 쌓일수록 인사이트가 정교해진다.
 */
export function LearningRhythmCard() {
  const { theme } = useTheme();
  const c = theme.colors;
  const history = useSrsStore((s) => s.history);

  const stats = useMemo(() => {
    const dowCounts = new Array(7).fill(0) as number[];
    let total = 0;
    let activeDays = 0;
    const activeDates: Date[] = [];

    for (const [key, ids] of Object.entries(history)) {
      const [y, m, d] = key.split('-').map(Number);
      const date = new Date(y, m, d);
      const n = ids.length;
      if (n > 0) { activeDays += 1; activeDates.push(date); }
      dowCounts[date.getDay()] += n;
      total += n;
    }

    // 최고 연속 학습(best streak)
    activeDates.sort((a, b) => a.getTime() - b.getTime());
    let best = 0, run = 0;
    let prev: Date | null = null;
    for (const d of activeDates) {
      if (prev && Math.round((d.getTime() - prev.getTime()) / 86_400_000) === 1) run += 1;
      else run = 1;
      best = Math.max(best, run);
      prev = d;
    }

    const maxDow = dowCounts.indexOf(Math.max(...dowCounts));
    return { dowCounts, total, activeDays, best, maxDow, hasData: total > 0 };
  }, [history]);

  const maxCount = Math.max(1, ...stats.dowCounts);

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.header}>
        <Ionicons name="pulse" size={16} color={c.primary} />
        <Text style={{ color: c.textPrimary, fontSize: 15, fontFamily: fontDisplay }}>학습 리듬</Text>
      </View>

      {stats.hasData ? (
        <>
          <View style={[styles.insight, { backgroundColor: c.primary + '12' }]}>
            <Text style={{ fontSize: 16 }}>🔥</Text>
            <Text style={{ color: c.textPrimary, fontSize: 12.5, flex: 1, lineHeight: 18, fontFamily: fontBody }}>
              주로 <Text style={{ fontFamily: fontDisplay, color: c.primary }}>{DOW[stats.maxDow]}요일</Text>에 가장 활발하게 학습해요
            </Text>
          </View>

          {/* 요일별 분포 */}
          <View style={styles.chart}>
            {stats.dowCounts.map((n, i) => {
              const h = 6 + Math.round((n / maxCount) * 62);
              const isMax = i === stats.maxDow && n > 0;
              return (
                <View key={i} style={styles.col}>
                  <Text style={[styles.count, { color: c.textSecondary }]}>{n || ''}</Text>
                  <View style={{ width: '58%', height: h, borderRadius: 5, backgroundColor: isMax ? c.primary : c.primary + '55' }} />
                  <Text style={{ color: i === 0 ? '#EF4444' : i === 6 ? '#3B82F6' : c.textSecondary, fontSize: 11, fontFamily: fontBody }}>{DOW[i]}</Text>
                </View>
              );
            })}
          </View>

          {/* 장기 통계 */}
          <View style={[styles.footer, { borderTopColor: c.border }]}>
            {[
              { v: `${stats.total}`, l: '총 학습', icon: 'albums' as const },
              { v: `${stats.activeDays}일`, l: '학습한 날', icon: 'calendar' as const },
              { v: `${stats.best}일`, l: '최고 연속', icon: 'flame' as const },
            ].map((s) => (
              <View key={s.l} style={styles.stat}>
                <Ionicons name={s.icon} size={13} color={c.textSecondary} />
                <Text style={{ color: c.textPrimary, fontSize: 15, fontFamily: fontMono, fontWeight: '900' }}>{s.v}</Text>
                <Text style={{ color: c.textSecondary, fontSize: 10.5, fontFamily: fontBody }}>{s.l}</Text>
              </View>
            ))}
          </View>
        </>
      ) : (
        <View style={{ alignItems: 'center', paddingVertical: 20 }}>
          <Ionicons name="pulse-outline" size={28} color={c.textSecondary} />
          <Text style={{ color: c.textSecondary, fontSize: 12.5, marginTop: 8, fontFamily: fontBody }}>학습을 쌓으면 나만의 리듬이 보여요</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, borderWidth: 1, padding: 16, marginBottom: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  insight: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 12, marginBottom: 14 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 96, gap: 6 },
  col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 5 },
  count: { fontSize: 10.5, fontFamily: fontMono, height: 14 },
  footer: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 14, paddingTop: 14, borderTopWidth: 1 },
  stat: { alignItems: 'center', gap: 2 },
});
