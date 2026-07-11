import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, FlatList, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuthStore } from '../../src/store/authStore';
import { Button } from '../../src/components/ui/Button';
import { Card } from '../../src/components/ui/Card';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { BottomSheet } from '../../src/components/ui/BottomSheet';
import { ReviewStatusCard } from '../../src/components/review/ReviewStatusCard';
import { LearningPersonaCard } from '../../src/components/stats/LearningPersonaCard';
import { LearningRhythmCard } from '../../src/components/stats/LearningRhythmCard';
import { LearningCalendar } from '../../src/components/community/LearningCalendar';
import { useSettingsStore } from '../../src/store/settingsStore';
import { fontMono, fontCute } from '../../src/theme/tokens';
import { getCategoryIcon, getCategoryColor } from '../../src/constants/categories';
import { calcEmblems, emblemRankingMock, EMBLEM_DEFS, type EmblemProgress } from '../../src/utils/emblems';
import { useAllCards } from '../../src/hooks/useCards';
import { useStudyStats } from '../../src/hooks/useStats';

function BigStat({ value, label }: { value: string; label: string }) {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  const fs = fontScale;
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ color: c.primary, fontSize: 28 * fs, fontWeight: '900', fontFamily: fontMono }}>{value}</Text>
      <Text style={{ color: c.textSecondary, fontSize: 11, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function WeeklyBarChart({ data, maxCount }: { data: { label: string; count: number }[]; maxCount: number }) {
  const { fontScale } = useTheme();
  const { theme } = useTheme();
  const c = theme.colors;
  const fs = fontScale;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 8, marginBottom: 24, marginTop: 12 }}>
      {data.map((d, i) => (
        <View key={`${d.label}${i}`} style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ color: c.textSecondary, fontSize: 11, marginBottom: 4, fontFamily: fontMono }}>{d.count}</Text>
          <View style={{ width: '70%', height: (d.count / maxCount) * 120 + 4, minHeight: 4, backgroundColor: c.primary, borderRadius: 6 }} />
          <Text style={{ color: d.label === '일' ? '#EF4444' : d.label === '토' ? '#3B82F6' : c.textSecondary, fontSize: 11, marginTop: 6, fontFamily: fontCute }}>{d.label}</Text>
        </View>
      ))}
    </View>
  );
}

function RankingRow({ rank, nickname, score, isMe }: { rank: number; nickname: string; score: number; isMe?: boolean }) {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  const fs = fontScale;
  const medals = ['🥇', '🥈', '🥉'];
  const medalColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isMe ? c.primary + '15' : 'transparent', borderRadius: 12, padding: 10, marginBottom: 4, borderWidth: 1, borderColor: isMe ? c.primary : 'transparent' }}>
      <Text style={{ width: 24, fontSize: 14 * fs, fontWeight: '800', color: isMe ? c.primary : c.textSecondary, textAlign: 'center', fontFamily: fontCute }}>
        {medals[rank - 1] || rank}
      </Text>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: medalColors[rank - 1] || c.border, alignItems: 'center', justifyContent: 'center', marginHorizontal: 8 }}>
        <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff', fontFamily: fontCute }}>{nickname.charAt(0)}</Text>
      </View>
      <Text style={{ color: isMe ? c.primary : c.textPrimary, fontSize: 13 * fs, fontWeight: isMe ? '800' : '600', flex: 1, fontFamily: fontCute }}>{nickname}</Text>
      <Text style={{ color: isMe ? c.primary : c.textSecondary, fontSize: 13 * fs, fontWeight: '800', fontFamily: fontMono }}>{score}점</Text>
    </View>
  );
}

export default function StatsScreen() {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  const fs = fontScale;
  const user = useAuthStore((s) => s.user);
  const interests = useSettingsStore((s) => s.interests);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEmblem, setSelectedEmblem] = useState<EmblemProgress | null>(null);
  const [rankingModal, setRankingModal] = useState(false);

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

  const emblems = useMemo(() => {
    const cardMap = new Map<string, { total: number; mastered: number }>();
    for (const [cat, stat] of categoryStats) {
      cardMap.set(cat, { total: stat.total, mastered: stat.mastered });
    }
    EMBLEM_DEFS.forEach((d) => { if (!cardMap.has(d.category)) cardMap.set(d.category, { total: 0, mastered: 0 }); });
    return calcEmblems(cardMap);
  }, [categoryStats]);

  const emblemRankings = useMemo(() => {
    if (!selectedEmblem) return [];
    const mock = emblemRankingMock(selectedEmblem.category);
    const hasMe = mock.some((r) => r.nickname === (user?.name ?? ''));
    if (!hasMe && user?.name) {
      mock.push({ rank: 6, nickname: user.name, score: Math.round(72 - Math.random() * 15), pct: selectedEmblem.topPct });
      mock.sort((a, b) => b.score - a.score);
      mock.forEach((r, i) => { r.rank = i + 1; });
    }
    return mock.slice(0, 5);
  }, [selectedEmblem, user?.name]);

  type Period = '7d' | '14d' | '30d';
  const [period, setPeriod] = useState<Period>('7d');
  const PERIOD_OPTIONS: { key: Period; label: string }[] = [['7d', '1주'], ['14d', '2주'], ['30d', '한달']].map(([k, l]) => ({ key: k as Period, label: l }));
  const dayCount = period === '7d' ? 7 : period === '14d' ? 14 : 30;
  const chartData = (stats?.weekly ?? []).slice(0, dayCount);
  const maxCount = Math.max(1, ...chartData.map((d) => d.count));
  const progressPct = stats?.totalCards ? Math.round((stats.totalLearned / stats.totalCards) * 100) : 0;

  const RANKING_DATA = useMemo(() => Array.from({ length: 50 }, (_, i) => {
    const nicknames = ['김안전', '박현장', '최예방', '이방호', '정점검', '한관리', '오대비', '강예방', '조점검', '신안전',
      '백호수', '송진단', '류예지', '권대응', '황방재', '전예찰', '고훈련', '문점검', '양안전', '임관리',
      '장예방', '서현장', '유관리', '홍안전', '구점검', '민예찰', '노방재', '진대응', '라훈련', '마안전',
      '왕안전', '배현장', '허예방', '남방호', '탁점검', '봉관리', '제갈안전', '독고예방', '황보현장', '선우안전',
      '강전문', '윤관리', '류안전', '조예방', '임현장', '한점검', '성관리', '차안전', '주방재', '진대비'];
    const score = Math.round(98 - i * 2 + Math.random() * 3);
    return { rank: i + 1, nickname: nicknames[i], score, isMe: i === 3 };
  }), []);

  const loading = isLoading || cardsLoading;
  const queryError = error || cardsError;

  if (loading && !stats && !queryError) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  if (queryError && !stats) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <ErrorState message="통계를 불러올 수 없어요" onRetry={() => { refetchStats(); refetchAll(); }} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
        contentContainerStyle={{ padding: 20 }}>
        <Card style={{ flexDirection: 'row', marginBottom: 20 }}>
          <BigStat value={`${stats?.totalLearned ?? 0}`} label="누적 학습" />
          <BigStat value={`${Math.round((stats?.accuracy ?? 0) * 100)}%`} label="정답률" />
          <BigStat value={`${stats?.streakDays ?? 0}일`} label="연속 학습" />
          <BigStat value={`${stats?.bestStreak ?? 0}일`} label="최고 기록" />
        </Card>

        <LearningPersonaCard cards={allCards} interests={interests} />

        <LearningRhythmCard />

        <LearningCalendar />

        <ReviewStatusCard />

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <View>
            <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontWeight: '700', fontFamily: fontCute }}>학습량</Text>
            <Text style={{ color: c.textSecondary, fontSize: 11, marginTop: 2, fontFamily: fontMono }}>
              {(() => {
                const end = new Date();
                const start = new Date(end);
                start.setDate(end.getDate() - dayCount + 1);
                const fmt = (d: Date) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
                return `${fmt(start)} ~ ${String(end.getMonth() + 1).padStart(2, '0')}.${String(end.getDate()).padStart(2, '0')}`;
              })()}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 4, backgroundColor: c.surfaceAlt, borderRadius: 10, padding: 3 }}>
            {PERIOD_OPTIONS.map((opt) => (
              <Pressable key={opt.key} onPress={() => setPeriod(opt.key)}
                style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: period === opt.key ? c.primary : 'transparent' }}>
                <Text style={{ color: period === opt.key ? c.textOnPrimary : c.textSecondary, fontSize: 12, fontWeight: '700', fontFamily: fontCute }}>{opt.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <WeeklyBarChart data={chartData} maxCount={maxCount} />

        <Card style={{ marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <Ionicons name="trending-up" size={16} color={c.primary} />
            <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontWeight: '700', fontFamily: fontCute }}>카테고리별 진행</Text>
          </View>
          {[...categoryStats.entries()].map(([cat, stat]) => {
            const pct = stat.total > 0 ? Math.round((stat.mastered / stat.total) * 100) : 0;
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

        <Card style={{ marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontWeight: '700', fontFamily: fontCute }}>🏆 전체 순위 <Text style={{ color: c.primary, fontSize: 12 * fs, fontWeight: '800', fontFamily: fontMono }}>(4등/86명)</Text></Text>
            <Pressable onPress={() => setRankingModal(true)}>
              <Text style={{ color: c.primary, fontSize: 12, fontWeight: '600', fontFamily: fontCute }}>더보기 →</Text>
            </Pressable>
          </View>
          {[
            { rank: 1, nickname: '김안전', score: 98 },
            { rank: 2, nickname: '박현장', score: 85 },
            { rank: 3, nickname: '최예방', score: 79 },
            { rank: 4, nickname: user?.name ?? '나', score: 72, isMe: true },
            { rank: 5, nickname: '이방호', score: 68 },
          ].map((r) => (
            <RankingRow key={r.rank} rank={r.rank} nickname={r.nickname} score={r.score} isMe={r.isMe} />
          ))}
        </Card>

        <Card style={{ marginBottom: 20 }}>
          <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontWeight: '700', marginBottom: 12, fontFamily: fontCute }}>🏅 엠블럼 순위</Text>
          {emblems.map((em) => {
            const rank = emblemRankingMock(em.category);
            return (
              <Pressable key={em.category} onPress={() => { setSelectedEmblem(em); setSheetOpen(true); }}
                style={{ backgroundColor: c.surfaceAlt, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: c.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ fontSize: 18, marginRight: 4 }}>{em.emoji}</Text>
                  <Text style={{ fontSize: 11 }}>{['', '🥉', '🥈', '🥇'][em.level]}</Text>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={{ color: c.textPrimary, fontSize: 13 * fs, fontWeight: '700', fontFamily: fontCute }}>{em.label}</Text>
                    <Text style={{ color: c.textSecondary, fontSize: 11, fontFamily: fontMono }}>이수 {em.pct}% · 상위 {em.topPct}%</Text>
                  </View>
                  <View style={{ backgroundColor: c.bg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ color: c.primary, fontSize: 12, fontWeight: '800', fontFamily: fontMono }}>1위 {rank[0].score}점</Text>
                  </View>
                </View>
                <View style={{ height: 4, backgroundColor: c.bg, borderRadius: 2, overflow: 'hidden' }}>
                  <View style={{ width: `${em.pct}%`, height: '100%', backgroundColor: c.primary, borderRadius: 2 }} />
                </View>
              </Pressable>
            );
          })}
        </Card>
      </ScrollView>

      <BottomSheet visible={sheetOpen} onClose={() => { setSheetOpen(false); setSelectedEmblem(null); }}>
        {selectedEmblem ? (
          <>
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              <View style={{ position: 'relative' }}>
                <Text style={{ fontSize: 40 }}>{selectedEmblem.emoji}</Text>
                <Text style={{ position: 'absolute', bottom: -4, right: -8, fontSize: 14 }}>{['', '🥉', '🥈', '🥇'][selectedEmblem.level]}</Text>
              </View>
              <Text style={{ color: c.textPrimary, fontSize: 17 * fs, fontWeight: '800', marginTop: 8, fontFamily: fontCute }}>{selectedEmblem.label}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                <Text style={{ color: c.textSecondary, fontSize: 12, fontFamily: fontCute }}>이수</Text>
                <Text style={{ color: c.primary, fontSize: 16 * fs, fontWeight: '800', fontFamily: fontMono }}>{selectedEmblem.pct}%</Text>
                <Text style={{ color: c.textSecondary, fontSize: 12, marginLeft: 8, fontFamily: fontCute }}>· 상위</Text>
                <Text style={{ color: c.primary, fontSize: 16 * fs, fontWeight: '800', fontFamily: fontMono }}>{selectedEmblem.topPct}%</Text>
              </View>
            </View>
            <View style={{ height: 6, backgroundColor: c.surfaceAlt, borderRadius: 3, overflow: 'hidden', marginBottom: 16 }}>
              <View style={{ width: `${selectedEmblem.pct}%`, height: '100%', backgroundColor: c.primary, borderRadius: 3 }} />
            </View>
            <Text style={{ color: c.textPrimary, fontSize: 13 * fs, fontWeight: '700', marginBottom: 8, fontFamily: fontCute }}>🏅 TOP 5</Text>
            {emblemRankings.map((r) => {
              const isMe = r.nickname === (user?.name ?? '');
              return (
                <RankingRow key={r.rank} rank={r.rank} nickname={r.nickname} score={r.score} isMe={isMe} />
              );
            })}
            <View style={{ marginTop: 16 }}>
              <Button label="닫기" variant="outline" onPress={() => { setSheetOpen(false); setSelectedEmblem(null); }} />
            </View>
          </>
        ) : null}
      </BottomSheet>

      <BottomSheet visible={rankingModal} onClose={() => setRankingModal(false)}>
        <View style={{ maxHeight: 400 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ color: c.textPrimary, fontSize: 17 * fs, fontWeight: '700', fontFamily: fontCute }}>🏆 전체 순위</Text>
            <Text style={{ color: c.textSecondary, fontSize: 11, fontFamily: fontMono }}>최대 50까지만 표기</Text>
          </View>
          <FlatList
            data={RANKING_DATA}
            renderItem={({ item }) => <RankingRow rank={item.rank} nickname={item.nickname} score={item.score} isMe={item.isMe} />}
            keyExtractor={(item) => String(item.rank)}
          />
        </View>
      </BottomSheet>
    </View>
  );
}
