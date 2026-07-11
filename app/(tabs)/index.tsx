import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, RefreshControl, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuthStore } from '../../src/store/authStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { Badge } from '../../src/components/ui/Badge';
import { Card } from '../../src/components/ui/Card';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { DailyQuestsCard } from '../../src/components/home/DailyQuestsCard';
import { DailyTipCard } from '../../src/components/home/DailyTipCard';
import { LivePresenceStrip } from '../../src/components/community/LivePresenceStrip';
import { fontMono, fontDisplay, fontBody } from '../../src/theme/tokens';
import { getCategoryIcon } from '../../src/constants/categories';
import { calcEmblems, getAcquiredEmblems } from '../../src/utils/emblems';
import { ROUTES } from '../../src/constants/routes';
import { useAllCards, useTodayCards } from '../../src/hooks/useCards';
import { useStudyStats } from '../../src/hooks/useStats';
import { useReview } from '../../src/hooks/useReview';

function StatPill({ value, label, icon }: { value: string; label: string; icon?: keyof typeof Ionicons.glyphMap }) {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  return (
    <Pressable style={{ flex: 1, backgroundColor: c.surfaceAlt, borderRadius: 12, padding: 12, alignItems: 'center' }}>
      {icon && <Ionicons name={icon} size={14} color={c.warning} style={{ marginBottom: 2 }} />}
      <Text style={{ color: c.primary, fontSize: 22 * fontScale, fontWeight: '900', fontFamily: fontMono }}>{value}</Text>
      <Text style={{ color: c.textSecondary, fontSize: 11, marginTop: 3, fontFamily: fontBody }}>{label}</Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const profileImage = useSettingsStore((s) => s.profileImage);
  const [refreshing, setRefreshing] = useState(false);

  const { data: allCards = [], isLoading: cardsLoading, error: cardsError, refetch: refetchAll } = useAllCards();
  const { data: todayCards = [], error: todayError, refetch: refetchToday } = useTodayCards();
  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useStudyStats();
  const { dueTodayCount } = useReview();

  const masteredCount = useMemo(() => allCards.filter((x) => x.status === 'mastered').length, [allCards]);

  const acquired = useMemo(() => {
    const cardMap = new Map<string, { total: number; mastered: number }>();
    for (const card of allCards) {
      const prev = cardMap.get(card.category) ?? { total: 0, mastered: 0 };
      prev.total++;
      if (card.status === 'mastered') prev.mastered++;
      cardMap.set(card.category, prev);
    }
    return getAcquiredEmblems(calcEmblems(cardMap));
  }, [allCards]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchAll(), refetchToday(), refetchStats()]);
    setRefreshing(false);
  }, [refetchAll, refetchToday, refetchStats]);

  if (statsLoading && !stats && cardsLoading && allCards.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
        contentContainerStyle={{ padding: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* 인사 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          {profileImage ? (
            <Image source={{ uri: profileImage }} style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: c.primary }} />
          ) : (
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 19, fontFamily: fontDisplay }}>{user?.name?.charAt(0) ?? '현'}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.textPrimary, fontSize: 18 * fs, fontFamily: fontDisplay }}>{user?.name ?? '점검자'} 님</Text>
            <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, marginTop: 1, fontFamily: fontBody }}>오늘도 3분, 안전을 쌓아요</Text>
          </View>
          {acquired.length > 0 && (
            <View style={{ flexDirection: 'row', gap: 2 }}>
              {acquired.slice(0, 3).map((em) => <Text key={em.category} style={{ fontSize: 16 }}>{em.emoji}</Text>)}
            </View>
          )}
        </View>

        <LivePresenceStrip />

        {/* 오늘의 학습 히어로 */}
        <View style={{ borderRadius: 18, backgroundColor: c.primary, padding: 18, marginBottom: 14, boxShadow: `0 8px 24px ${c.primary}44` }}>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12.5 * fs, fontFamily: fontBody }}>오늘의 학습</Text>
          <Text style={{ color: '#fff', fontSize: 19 * fs, marginTop: 2, marginBottom: 14, fontFamily: fontDisplay }}>3분이면 충분해요 👷</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={() => router.push(ROUTES.cards)} style={{ flex: 1, backgroundColor: '#fff', borderRadius: 14, paddingVertical: 13, alignItems: 'center', gap: 3 }}>
              <Ionicons name="school" size={20} color={c.primary} />
              <Text style={{ color: c.primary, fontSize: 13.5 * fs, fontFamily: fontDisplay }}>학습 시작</Text>
              <Text style={{ color: c.textSecondary, fontSize: 10.5, fontFamily: fontMono }}>새 카드 {todayCards.length}</Text>
            </Pressable>
            <Pressable onPress={() => router.push(ROUTES.review)} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 14, paddingVertical: 13, alignItems: 'center', gap: 3 }}>
              <View>
                <Ionicons name="refresh" size={20} color="#fff" />
                {dueTodayCount > 0 && (
                  <View style={{ position: 'absolute', top: -4, right: -8, backgroundColor: c.warning, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
                    <Text style={{ color: '#fff', fontSize: 9, fontFamily: fontMono, fontWeight: '800' }}>{dueTodayCount}</Text>
                  </View>
                )}
              </View>
              <Text style={{ color: '#fff', fontSize: 13.5 * fs, fontFamily: fontDisplay }}>복습</Text>
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 10.5, fontFamily: fontMono }}>{dueTodayCount > 0 ? `${dueTodayCount}개 대기` : '완료'}</Text>
            </Pressable>
          </View>
        </View>

        {/* 학습 현황 + 통계 보기 */}
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ color: c.textPrimary, fontSize: 14 * fs, fontFamily: fontDisplay }}>학습 현황</Text>
            <Pressable onPress={() => router.push(ROUTES.stats)} hitSlop={6}>
              <Text style={{ color: c.primary, fontSize: 12.5 * fs, fontFamily: fontDisplay }}>통계 보기 →</Text>
            </Pressable>
          </View>
          {statsError ? (
            <ErrorState message="통계를 불러올 수 없습니다" onRetry={refetchStats} />
          ) : (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <StatPill value={`${stats?.streakDays ?? '-'}일`} label="연속 학습" icon="flame" />
              <StatPill value={`${masteredCount}개`} label="마스터" />
              <StatPill value={`${stats ? Math.round(stats.accuracy * 100) : '-'}%`} label="정답률" />
            </View>
          )}
        </Card>

        <DailyQuestsCard />
        <DailyTipCard />

        {/* 오늘의 학습 카드 */}
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <Text style={{ color: c.textPrimary, fontSize: 14 * fs, fontFamily: fontDisplay }}>오늘의 학습 카드</Text>
            <Pressable onPress={() => router.push(ROUTES.contents)} hitSlop={6}>
              <Text style={{ color: c.primary, fontSize: 12.5 * fs, fontFamily: fontDisplay }}>학습 목표 →</Text>
            </Pressable>
          </View>
          {todayError ? (
            <ErrorState message="카드를 불러올 수 없습니다" onRetry={() => { refetchToday(); refetchAll(); }} />
          ) : todayCards.length === 0 ? (
            <Text style={{ color: c.textSecondary, lineHeight: 22, fontFamily: fontBody }}>
              오늘 학습할 카드를 모두 완료했어요!{'\n'}내일 새로운 카드로 만나요 🎉
            </Text>
          ) : (
            todayCards.slice(0, 3).map((card) => (
              <Pressable key={card.id} onPress={() => router.push(ROUTES.content(card.id) as never)}
                style={{ backgroundColor: c.surfaceAlt, borderRadius: 12, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name={getCategoryIcon(card.category)} size={20} color={c.primary} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Badge label={card.category} />
                  <Text style={{ color: c.textPrimary, fontSize: 13.5 * fs, marginTop: 4, lineHeight: 19, fontFamily: fontDisplay }} numberOfLines={2}>{card.question}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={c.textSecondary} />
              </Pressable>
            ))
          )}
          {cardsError && <ErrorState message="컨텐츠를 불러올 수 없습니다" onRetry={refetchAll} />}
        </Card>
      </ScrollView>
    </View>
  );
}
