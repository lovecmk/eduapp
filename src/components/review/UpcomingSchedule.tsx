import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, fontDisplay, fontBody, fontMono } from '../../theme/tokens';
import type { UpcomingDay } from '../../hooks/useReview';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/** 향후 7일 복습 예정 부하를 막대로 보여주는 미니 스케줄. */
export function UpcomingSchedule({ days }: { days: UpcomingDay[] }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const max = Math.max(1, ...days.map((d) => d.count));

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.textPrimary }]}>다가오는 복습 일정</Text>
        <Text style={[styles.sub, { color: c.textSecondary }]}>향후 7일</Text>
      </View>
      <View style={styles.row}>
        {days.map((d, i) => {
          const h = 8 + Math.round((d.count / max) * 56);
          const active = d.count > 0;
          const color = d.isToday ? c.primary : active ? c.primary + '99' : c.surfaceAlt;
          return (
            <View key={i} style={styles.col}>
              <Text style={[styles.count, { color: active ? c.textPrimary : c.textSecondary }]}>{d.count || ''}</Text>
              <View style={[styles.barTrack, { justifyContent: 'flex-end' }]}>
                <View style={{ height: h, borderRadius: 5, backgroundColor: color }} />
              </View>
              <Text style={[styles.dow, { color: d.isToday ? c.primary : c.textSecondary, fontFamily: d.isToday ? fontDisplay : fontBody }]}>
                {d.isToday ? '오늘' : DOW[d.date.getDay()]}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, borderWidth: 1, padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 14, fontFamily: fontDisplay },
  sub: { fontSize: 11, fontFamily: fontMono },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 92 },
  col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 5 },
  count: { fontSize: 11, fontFamily: fontMono, height: 14 },
  barTrack: { height: 64, width: '64%' },
  dow: { fontSize: 11 },
});
