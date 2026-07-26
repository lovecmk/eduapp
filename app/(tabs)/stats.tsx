import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, FlatList, Pressable, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuthStore } from '../../src/store/authStore';
import { ROUTES } from '../../src/constants/routes';
import { Button } from '../../src/components/ui/Button';
import { Card } from '../../src/components/ui/Card';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { BottomSheet } from '../../src/components/ui/BottomSheet';
import { ReviewStatusCard } from '../../src/components/review/ReviewStatusCard';
import { LearningPersonaCard } from '../../src/components/stats/LearningPersonaCard';
import { LearningRhythmCard } from '../../src/components/stats/LearningRhythmCard';
import { WeeklyChart } from '../../src/components/stats/WeeklyChart';
import { StatsSkeleton } from '../../src/components/skeletons';
import { useSettingsStore } from '../../src/store/settingsStore';
import { fontMono, fontCute, fontDisplay, fontBody } from '../../src/theme/tokens';
import { getCategoryIcon, getCategoryColor } from '../../src/constants/categories';
import { calcEmblems, emblemRankingMock, EMBLEM_DEFS, type EmblemProgress } from '../../src/utils/emblems';
import { useAllCards } from '../../src/hooks/useCards';
import { useStudyStats } from '../../src/hooks/useStats';
import type { LearningInsights } from '../../src/domain/models/StudyStats';
import { useDailyQuota } from '../../src/hooks/useDailyQuota';
import { useCommunity } from '../../src/hooks/useCommunity';
import { useFactionStore } from '../../src/store/factionStore';
import { FACTIONS, getFaction, factionStandings, type FactionId } from '../../src/constants/factions';
import { contentColumn } from '../../src/theme/layout';

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

/** 파생 학습 인사이트 카드 — 레벨/주간 활동/강·약 분야를 한눈에(통계 강화). */
function InsightsCard({ insights: ins }: { insights: LearningInsights }) {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  const fs = fontScale;
  const levelPct = Math.min(100, Math.round(((10 - ins.nextLevelIn) / 10) * 100));
  const chip = (icon: keyof typeof Ionicons.glyphMap, color: string, label: string, value: string) => (
    <View style={{ flex: 1, minWidth: '46%', backgroundColor: c.surfaceAlt, borderRadius: 12, padding: 11 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 }}>
        <Ionicons name={icon} size={13} color={color} />
        <Text style={{ color: c.textSecondary, fontSize: 11, fontFamily: fontBody }}>{label}</Text>
      </View>
      <Text numberOfLines={1} style={{ color: c.textPrimary, fontSize: 13.5 * fs, fontWeight: '800', fontFamily: fontCute }}>{value}</Text>
    </View>
  );
  return (
    <Card style={{ marginBottom: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <Ionicons name="bulb" size={16} color={c.warning} />
        <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontWeight: '700', fontFamily: fontCute }}>학습 인사이트</Text>
      </View>

      {/* 레벨 진행 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ backgroundColor: c.primary + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ color: c.primary, fontSize: 12 * fs, fontWeight: '900', fontFamily: fontMono }}>Lv.{ins.level}</Text>
          </View>
          <Text style={{ color: c.textPrimary, fontSize: 13 * fs, fontWeight: '700', fontFamily: fontCute }}>{ins.levelTitle}</Text>
        </View>
        <Text style={{ color: c.textSecondary, fontSize: 11, fontFamily: fontMono }}>다음 레벨까지 {ins.nextLevelIn}장</Text>
      </View>
      <View style={{ height: 8, backgroundColor: c.surfaceAlt, borderRadius: 4, overflow: 'hidden', marginBottom: 14 }}>
        <View style={{ width: `${levelPct}%`, height: '100%', backgroundColor: c.primary, borderRadius: 4 }} />
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {chip('calendar', c.primary, '주간 활동', `${ins.activeDays}일 · ${ins.weeklyTotal}장`)}
        {chip('speedometer', c.success, '활동일 평균', `${ins.avgPerActiveDay}장/일`)}
        {ins.topCategory ? chip('ribbon', getCategoryColor(ins.topCategory) ?? c.success, '강점 분야 · 정답률', `${ins.topCategory} ${Math.round(ins.topCategoryAccuracy)}%`) : null}
        {ins.weakCategory ? chip('barbell', getCategoryColor(ins.weakCategory) ?? c.warning, '보강 필요 · 정답률', `${ins.weakCategory} ${Math.round(ins.weakCategoryAccuracy)}%`) : null}
      </View>
    </Card>
  );
}

/** 오늘의 학습(하루 신규 5장 상한) — 변경된 학습 시스템을 통계에 반영. */
function DailyLearningCard({ streakDays }: { streakDays: number }) {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  const fs = fontScale;
  const quota = useDailyQuota();
  const pct = quota.limit > 0 ? Math.round((quota.used / quota.limit) * 100) : 0;
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

/** 내 진영 · 안전 빌딩 대항전 요약 — 진영을 눌러 커뮤니티의 상세 기여로 이동. */
function MyFactionCard() {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  const fs = fontScale;
  const router = useRouter();
  const factionId = useFactionStore((s) => s.faction);
  const myFaction = getFaction(factionId);
  const { data: community } = useCommunity();

  if (!myFaction) {
    return (
      <Pressable onPress={() => router.push(ROUTES.factionSelect as never)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 16, padding: 16, marginBottom: 20 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="flag" size={20} color={c.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.textPrimary, fontSize: 14 * fs, fontWeight: '800', fontFamily: fontCute }}>진영을 선택해요</Text>
          <Text style={{ color: c.textSecondary, fontSize: 12 * fs, fontFamily: fontBody, marginTop: 2 }}>진영에 들어가 함께 안전 빌딩을 올려요</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={c.textSecondary} />
      </Pressable>
    );
  }

  // 이번 달 진영 대항전 순위에서 내 진영의 위치·기여를 계산.
  let myFloors = 0, myProblems = 0, myRank = 0, totalFloors = 0;
  if (community?.building) {
    const { current, floorSize } = community.building;
    const seed = current.month.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0);
    const standings = factionStandings(current.problems, floorSize, seed);
    const idx = standings.findIndex((s) => s.id === factionId);
    if (idx >= 0) { myFloors = standings[idx].floors; myProblems = standings[idx].problems; myRank = idx + 1; }
    totalFloors = standings.reduce((a, s) => a + s.floors, 0);
  }
  const rankLabel = myRank === 1 ? '🏆 선두' : myRank > 0 ? `${myRank}위` : '집계 중';

  return (
    <Pressable onPress={() => router.push(ROUTES.community as never)}
      style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: myFaction.color + '55', borderRadius: 16, padding: 16, marginBottom: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: myFaction.color + '1A', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 20 }}>{myFaction.emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.textPrimary, fontSize: 14.5 * fs, fontWeight: '800', fontFamily: fontCute }}>{myFaction.name} · {myFaction.emblem}</Text>
          <Text style={{ color: c.textSecondary, fontSize: 11.5 * fs, fontFamily: fontBody, marginTop: 1 }} numberOfLines={1}>{myFaction.tagline}</Text>
        </View>
        <View style={{ backgroundColor: myFaction.color + '18', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Text style={{ color: myFaction.color, fontSize: 12 * fs, fontWeight: '900', fontFamily: fontMono }}>{rankLabel}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1, backgroundColor: c.surfaceAlt, borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}>
          <Text style={{ color: myFaction.color, fontSize: 16 * fs, fontWeight: '900', fontFamily: fontMono }}>{myFloors}층</Text>
          <Text style={{ color: c.textSecondary, fontSize: 10.5, fontFamily: fontBody, marginTop: 2 }}>우리 진영 층수</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: c.surfaceAlt, borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}>
          <Text style={{ color: myFaction.color, fontSize: 16 * fs, fontWeight: '900', fontFamily: fontMono }}>{myProblems.toLocaleString()}</Text>
          <Text style={{ color: c.textSecondary, fontSize: 10.5, fontFamily: fontBody, marginTop: 2 }}>기여 문제</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: c.surfaceAlt, borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}>
          <Text style={{ color: myFaction.color, fontSize: 16 * fs, fontWeight: '900', fontFamily: fontMono }}>{totalFloors}층</Text>
          <Text style={{ color: c.textSecondary, fontSize: 10.5, fontFamily: fontBody, marginTop: 2 }}>세 진영 합계</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 12 }}>
        <Text style={{ color: myFaction.color, fontSize: 12 * fs, fontFamily: fontCute }}>안전 빌딩 대항전 자세히 보기</Text>
        <Ionicons name="chevron-forward" size={14} color={myFaction.color} />
      </View>
    </Pressable>
  );
}

export default function StatsScreen() {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  const fs = fontScale;
  const router = useRouter();
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

      </ScrollView>
    </View>
  );
}
