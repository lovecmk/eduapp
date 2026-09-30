import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Card } from '../../src/components/ui/Card';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { WeeklyChart } from '../../src/components/stats/WeeklyChart';
import { StatsSkeleton } from '../../src/components/skeletons';
import { fontMono, fontCute, fontBody } from '../../src/theme/tokens';
import { getCategoryIcon, getCategoryColor } from '../../src/constants/categories';
import { useAllCards } from '../../src/hooks/useCards';
import { useStudyStats } from '../../src/hooks/useStats';
import { useDailyQuota } from '../../src/hooks/useDailyQuota';
import { contentColumn } from '../../src/theme/layout';
import { percent } from '../../src/utils/percent';

function StatTile({ icon, color, value, label }: { icon: keyof typeof Ionicons.glyphMap; color: string; value: string; label: string }) {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  return (
    <View style={{ flex: 1, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center' }}>
      <Ionicons name={icon} size={16} color={color} style={{ marginBottom: 5 }} />
      <Text numberOfLines={1} style={{ color: c.textPrimary, fontSize: 15 * fontScale, fontFamily: fontMono, fontWeight: '900' }}>{value}</Text>
      <Text numberOfLines={1} style={{ color: c.textSecondary, fontSize: 10, marginTop: 2, fontFamily: fontBody }}>{label}</Text>
    </View>
  );
}

/** 오늘의 학습(하루 신규 5장 상한) — 변경된 학습 시스템을 통계에 반영. */
function DailyLearningCard({ streakDays }: { streakDays: number }) {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  const fs = fontScale;
  const quota = useDailyQuota();
  const pct = percent(quota.used, quota.limit);
  const done = !quota.canLearn;
  const barColor = done ? c.success : c.primary;
  return (
    <Card style={{ marginBottom: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name={done ? 'checkmark-done' : 'school'} size={16} color={barColor} />
          <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontWeight: '700', fontFamily: fontCute }}>오늘의 학습</Text>
        </View>
        <Text style={{ color: barColor, fontSize: 18 * fs, fontWeight: '900', fontFamily: fontMono }}>
          {quota.used}<Text style={{ color: c.textSecondary, fontSize: 13 * fs }}> / {quota.limit}장</Text>
        </Text>
      </View>
      <View style={{ height: 10, backgroundColor: c.surfaceAlt, borderRadius: 5, overflow: 'hidden' }}>
        <View style={{ width: `${Math.max(3, pct)}%`, height: '100%', backgroundColor: barColor, borderRadius: 5 }} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <Text style={{ color: c.textSecondary, fontSize: 11.5, fontFamily: fontBody }}>
          {done ? '오늘 신규 학습을 모두 마쳤어요 · 복습으로 이어가요' : `오늘 ${quota.remaining}장 더 학습할 수 있어요`}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <Ionicons name="flame" size={12} color={c.warning} />
          <Text style={{ color: c.textSecondary, fontSize: 11, fontFamily: fontMono }}>{streakDays}일 연속</Text>
        </View>
      </View>
    </Card>
  );
}

export default function StatsScreen() {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  const fs = fontScale;
  const [refreshing, setRefreshing] = useState(false);

  const { data: stats, isLoading, error, refetch: refetchStats } = useStudyStats();
  const { data: allCards = [], isLoading: cardsLoading, error: cardsError, refetch: refetchAll } = useAllCards();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchStats(), refetchAll()]);
    setRefreshing(false);
  }, [refetchStats, refetchAll]);

  const categoryStats = useMemo(() => {
    const map = new Map<string, { total: number; learning: number; mastered: number }>();
    for (const card of allCards) {
      const prev = map.get(card.category) ?? { total: 0, learning: 0, mastered: 0 };
      prev.total++;
      if (card.status === 'learning') prev.learning++;
      if (card.status === 'mastered') prev.mastered++;
      map.set(card.category, prev);
    }
    return map;
  }, [allCards]);

  // 진도율 — 분모가 0 이거나 서버 합계가 어긋나도 0~100 을 벗어나지 않게(percent 주석 참고).
  const progressPct = percent(stats?.totalLearned ?? 0, stats?.totalCards ?? 0);

  // (예전 이 자리에는 화면에 그리지도 않는 '랭킹' 두 벌이 매 렌더 계산되고 있었다 —
  //  Math.random() 으로 점수를 지어낸 가짜 50명과, 고정 이름표로 만든 엠블럼 순위.
  //  서버에 순위 API 가 없는 동안 순위는 보여 줄 것이 없다. 지어낸 숫자를 남겨 두면
  //  언젠가 누군가 다시 화면에 붙인다.)

  const loading = isLoading || cardsLoading;
  const queryError = error || cardsError;

  if (loading && !stats && !queryError) {
    return <StatsSkeleton />;
  }

  if (queryError && !stats) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <ErrorState message="통계를 불러올 수 없어요" onRetry={() => { refetchStats(); refetchAll(); }} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
        contentContainerStyle={{ padding: 20, ...contentColumn }}>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
          <StatTile icon="book" color={c.primary} value={`${stats?.totalLearned ?? 0}`} label="누적 학습" />
          <StatTile icon="flame" color={c.warning} value={`${stats?.streakDays ?? 0}일`} label="연속 학습" />
          <StatTile icon="trophy" color="#F2705B" value={`${stats?.bestStreak ?? 0}일`} label="최고 기록" />
        </View>

        {/* 오늘의 학습(신규 3장 + 복습 포함 5장) — 개인 학습 현황. */}
        <DailyLearningCard streakDays={stats?.streakDays ?? 0} />

        {/* 주간 학습량(개인 통계). */}
        <WeeklyChart weekly={stats?.weekly ?? []} />

        {/* 성취 카드 만들기·학습 인사이트·학습 성향(수호대)·순위/엠블럼 등 '자랑·비교' 성격의
            항목은 커뮤니티로 옮겨, 통계 화면은 학습자 개인의 단순 통계만 담는다. */}

        <Card style={{ marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <Ionicons name="trending-up" size={16} color={c.primary} />
            <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontWeight: '700', fontFamily: fontCute }}>카테고리별 진행</Text>
          </View>
          {[...categoryStats.entries()].map(([cat, stat]) => {
            const pct = percent(stat.mastered, stat.total);
            return (
              <View key={cat} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name={getCategoryIcon(cat)} size={14} color={getCategoryColor(cat) ?? c.textSecondary} />
                    <Text style={{ color: c.textPrimary, fontSize: 12, fontWeight: '600', fontFamily: fontCute }}>{cat}</Text>
                  </View>
                  <Text style={{ color: c.textSecondary, fontSize: 11, fontFamily: fontMono }}>{pct}%</Text>
                </View>
                <View style={{ height: 6, backgroundColor: c.surfaceAlt, borderRadius: 3, overflow: 'hidden' }}>
                  <View style={{ width: `${pct}%`, height: '100%', backgroundColor: getCategoryColor(cat) ?? c.primary, borderRadius: 3 }} />
                </View>
              </View>
            );
          })}
        </Card>

        <Card style={{ marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="stats-chart" size={16} color={c.primary} />
              <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontWeight: '700', fontFamily: fontCute }}>내 학습 진도율</Text>
            </View>
            <Text style={{ color: c.primary, fontSize: 18 * fs, fontWeight: '900', fontFamily: fontMono }}>{progressPct}%</Text>
          </View>
          <View style={{ height: 14, backgroundColor: c.surfaceAlt, borderRadius: 7, overflow: 'hidden', position: 'relative' }}>
            <View style={{ width: `${progressPct}%`, height: '100%', backgroundColor: c.primary, borderRadius: 7 }} />
            <View style={{ position: 'absolute', left: `${progressPct}%`, top: -4, marginLeft: -8, width: 22, height: 22, borderRadius: 11, backgroundColor: c.primary, borderWidth: 2, borderColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="flag" size={11} color={c.textOnPrimary} />
            </View>
          </View>
          <Text style={{ color: c.textSecondary, fontSize: 11, marginTop: 6, fontFamily: fontMono }}>
            {stats?.totalLearned ?? 0} / {stats?.totalCards ?? 0} 카드 완료
          </Text>
        </Card>

      </ScrollView>
    </View>
  );
}
