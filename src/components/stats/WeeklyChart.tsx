import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, fontDisplay, fontBody, fontMono } from '../../theme/tokens';
import type { DailyProgress } from '../../domain/models/StudyStats';

type Period = '7d' | '14d' | '30d';
const PERIODS: { key: Period; label: string; days: number }[] = [
  { key: '7d', label: '1주', days: 7 },
  { key: '14d', label: '2주', days: 14 },
  { key: '30d', label: '한달', days: 30 },
];

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/** 학습량 차트 — 기간 선택 + 평균선 + 요약. */
export function WeeklyChart({ weekly }: { weekly: DailyProgress[] }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [period, setPeriod] = useState<Period>('7d');
  const days = PERIODS.find((p) => p.key === period)!.days;

  const data = useMemo(() => weekly.slice(-days), [weekly, days]);
  const total = data.reduce((s, d) => s + d.count, 0);
  const max = Math.max(1, ...data.map((d) => d.count));
  const avg = data.length ? total / data.length : 0;
  const maxIdx = data.reduce((mi, d, i, arr) => (d.count > arr[mi].count ? i : mi), 0);

  // 표시 막대 수 제한(30일은 촘촘하므로 라벨 간소화)
  const showLabelsEvery = days > 14 ? 5 : 1;
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1);
  const fmt = (d: Date) => `${d.getMonth() + 1}.${d.getDate()}`;

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.header}>
        <View>
          <Text style={{ color: c.textPrimary, fontSize: 15, fontFamily: fontDisplay }}>학습량</Text>
          <Text style={{ color: c.textSecondary, fontSize: 11, marginTop: 2, fontFamily: fontMono }}>{fmt(startDate)} ~ {fmt(now)}</Text>
        </View>
        <View style={[styles.periodRow, { backgroundColor: c.surfaceAlt }]}>
          {PERIODS.map((p) => {
            const active = period === p.key;
            return (
              <Pressable accessibilityRole="button" key={p.key} onPress={() => setPeriod(p.key)} style={[styles.periodBtn, active && { backgroundColor: c.primary }]}>
                <Text style={{ color: active ? '#fff' : c.textSecondary, fontSize: 12, fontFamily: fontDisplay }}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* 요약 */}
      <View style={styles.summary}>
        <View style={[styles.chip, { backgroundColor: c.primary + '12' }]}>
          <Text style={{ color: c.textSecondary, fontSize: 11, fontFamily: fontBody }}>총 </Text>
          <Text style={{ color: c.primary, fontSize: 13, fontFamily: fontMono, fontWeight: '800' }}>{total}</Text>
          <Text style={{ color: c.textSecondary, fontSize: 11, fontFamily: fontBody }}> 개</Text>
        </View>
        <View style={[styles.chip, { backgroundColor: c.surfaceAlt }]}>
          <Text style={{ color: c.textSecondary, fontSize: 11, fontFamily: fontBody }}>일평균 </Text>
          <Text style={{ color: c.textPrimary, fontSize: 13, fontFamily: fontMono, fontWeight: '800' }}>{avg.toFixed(1)}</Text>
        </View>
      </View>

      {/* 차트 — 아직 학습 기록이 없으면 빈 캔버스 대신 안내를 보여준다.
          (0으로 가득한 축만 그리면 화면이 '깨진 것'처럼 보인다) */}
      {total === 0 ? (
        <View style={[styles.empty, { backgroundColor: c.surfaceAlt }]}>
          <Ionicons name="bar-chart-outline" size={26} color={c.textSecondary} />
          <Text style={{ color: c.textPrimary, fontSize: 13, marginTop: 8, fontFamily: fontDisplay }}>
            아직 학습 기록이 없어요
          </Text>
          <Text style={{ color: c.textSecondary, fontSize: 11.5, marginTop: 4, fontFamily: fontBody, textAlign: 'center' }}>
            오늘 카드를 학습하면 여기에 그래프가 쌓여요
          </Text>
        </View>
      ) : (
      <View style={styles.chart}>
        {/* 평균선 */}
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 22 + (avg / max) * 108, height: 1, backgroundColor: c.warning + '99', borderStyle: 'dashed', borderWidth: 0.5, borderColor: c.warning + '99' }} />
        {data.map((d, i) => {
          const h = 4 + (d.count / max) * 108;
          const isMax = i === maxIdx && d.count > 0;
          const showLabel = i % showLabelsEvery === 0 || i === data.length - 1;
          const dow = (startDate.getDay() + i) % 7;
          return (
            <View key={i} style={styles.col}>
              {days <= 14 && <Text style={[styles.count, { color: c.textSecondary }]}>{d.count || ''}</Text>}
              <View style={{ width: days > 14 ? 5 : '58%', height: h, borderRadius: 4, backgroundColor: isMax ? c.primary : c.primary + '66' }} />
              {showLabel && (
                <Text style={{ color: dow === 0 ? '#EF4444' : dow === 6 ? '#3B82F6' : c.textSecondary, fontSize: 9.5, marginTop: 5, fontFamily: fontBody }}>
                  {days > 14 ? fmt(new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i)) : DOW[dow]}
                </Text>
              )}
            </View>
          );
        })}
      </View>
      )}
      {/* 범례는 실제 그래프가 있을 때만 의미가 있다 */}
      {total > 0 && (
      <View style={styles.legend}>
        <View style={{ width: 12, height: 0, borderTopWidth: 1, borderTopColor: c.warning + '99', borderStyle: 'dashed' }} />
        <Text style={{ color: c.textSecondary, fontSize: 10.5, fontFamily: fontBody }}>일평균</Text>
        <Ionicons name="ellipse" size={7} color={c.primary} style={{ marginLeft: 8 }} />
        <Text style={{ color: c.textSecondary, fontSize: 10.5, fontFamily: fontBody }}>최다 학습일</Text>
      </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, borderWidth: 1, padding: 16, marginBottom: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  periodRow: { flexDirection: 'row', gap: 3, borderRadius: 10, padding: 3 },
  periodBtn: { paddingVertical: 5, paddingHorizontal: 11, borderRadius: 8 },
  summary: { flexDirection: 'row', gap: 8, marginTop: 14, marginBottom: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 150, gap: 4, marginTop: 8, position: 'relative' },
  empty: { height: 150, marginTop: 8, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  count: { fontSize: 10, fontFamily: fontMono, marginBottom: 3, height: 13 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
});
