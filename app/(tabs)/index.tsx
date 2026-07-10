import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, RefreshControl, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuthStore } from '../../src/store/authStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { Badge } from '../../src/components/ui/Badge';
import { Card } from '../../src/components/ui/Card';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { LivePresenceCard } from '../../src/components/community/LivePresenceCard';
import { LearningCalendar } from '../../src/components/community/LearningCalendar';
import { fontMono, fontCute } from '../../src/theme/tokens';
import { getCategoryIcon } from '../../src/constants/categories';
import { getDifficultyMeta } from '../../src/constants/difficulty';
import { calcEmblems, getAcquiredEmblems } from '../../src/utils/emblems';
import { ROUTES } from '../../src/constants/routes';
import { useAllCards, useTodayCards } from '../../src/hooks/useCards';
import { useStudyStats } from '../../src/hooks/useStats';

function StatPill({ value, label }: { value: string; label: string }) {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  const fs = fontScale;
  return (
    <View style={{ flex: 1, backgroundColor: c.surfaceAlt, borderRadius: 12, padding: 12, alignItems: 'center' }}>
      <Text style={{ color: c.primary, fontSize: 24 * fs, fontWeight: '900', fontFamily: fontMono }}>{value}</Text>
      <Text style={{ color: c.textSecondary, fontSize: 11, marginTop: 4 }}>{label}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  const fs = fontScale;
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const profileImage = useSettingsStore((s) => s.profileImage);
  const [refreshing, setRefreshing] = useState(false);

  const { data: allCards = [], isLoading: cardsLoading, error: cardsError, refetch: refetchAll } = useAllCards();
  const { data: todayCards = [], isLoading: todayLoading, error: todayError, refetch: refetchToday } = useTodayCards();
  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useStudyStats();

  const masteredCount = useMemo(
    () => allCards.filter((c) => c.status === 'mastered').length,
    [allCards]
  );

  const emblems = useMemo(() => {
    const cardMap = new Map<string, { total: number; mastered: number }>();
    for (const card of allCards) {
      const prev = cardMap.get(card.category) ?? { total: 0, mastered: 0 };
      prev.total++;
      if (card.status === 'mastered') prev.mastered++;
      cardMap.set(card.category, prev);
    }
    return calcEmblems(cardMap);
  }, [allCards]);
  const acquired = getAcquiredEmblems(emblems);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchAll(), refetchToday(), refetchStats()]);
    setRefreshing(false);
  }, [refetchAll, refetchToday, refetchStats]);

  const isInitialLoading = (cardsLoading && todayLoading && allCards.length === 0) || (statsLoading && !stats);

  if (isInitialLoading) {
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
      >
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, position: 'relative' }}>
            {profileImage ? (
              <Image source={{ uri: profileImage }} style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: c.primary }} />
            ) : (
              <View
                style={{
                  width: 48, height: 48, borderRadius: 24, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center',
                  boxShadow: `0 2px 8px ${c.primary}66`,
                }}
              >
                <Text style={{ color: c.textOnPrimary, fontSize: 20, fontWeight: '800', fontFamily: fontCute }}>
                  {user?.name?.charAt(0) ?? '현'}
                </Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.textPrimary, fontSize: 18 * fs, fontWeight: '900', fontFamily: fontCute }}>
                {user?.name ?? '현장 작업자'} 님
              </Text>
              <Text style={{ color: c.textSecondary, fontSize: 13 * fs, marginTop: 2 }}>
                오늘도 함께 학습해요
              </Text>
            </View>
            {acquired.length > 0 && (
              <View style={{ position: 'absolute', bottom: -4, right: 0, flexDirection: 'row', gap: 2 }}>
                {acquired.slice(0, 3).map((em) => (
                  <Text key={em.category} style={{ fontSize: 11 }}>{em.emoji}</Text>
                ))}
              </View>
            )}
          </View>
        </Card>

        <Card>
          <Text style={{ color: c.textPrimary, fontSize: 14 * fs, fontWeight: '700', marginBottom: 12, fontFamily: fontCute }}>학습 현황</Text>
          {statsError ? (
            <ErrorState message="통계를 불러올 수 없습니다" onRetry={refetchStats} />
          ) : (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, position: 'relative' }}>
                <StatPill value={`${stats?.streakDays ?? '-'}일`} label="연속 학습" />
                <View style={{ position: 'absolute', top: -2, right: 2 }}>
                  <Ionicons name="flame" size={14} color={c.warning} />
                </View>
              </View>
              <StatPill value={`${masteredCount}개`} label="마스터" />
              <StatPill value={`${stats ? Math.round(stats.accuracy * 100) : '-'}%`} label="정답률" />
            </View>
          )}
        </Card>

        <Pressable onPress={() => router.push(ROUTES.cards)}
          style={{ backgroundColor: c.primary, borderRadius: 16, padding: 16, alignItems: 'center', marginBottom: 14 }}>
          <Text style={{ color: c.textOnPrimary, fontSize: 15 * fs, fontWeight: '800', fontFamily: fontCute }}>학습 시작하기</Text>
        </Pressable>

        <LivePresenceCard />

        <LearningCalendar />

        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <Text style={{ color: c.textPrimary, fontSize: 14 * fs, fontWeight: '700', fontFamily: fontCute }}>오늘의 학습</Text>
          </View>
          {todayError ? (
            <ErrorState message="카드를 불러올 수 없습니다" onRetry={() => { refetchToday(); refetchAll(); }} />
          ) : todayLoading && todayCards.length === 0 ? (
            <ActivityIndicator color={c.primary} style={{ marginVertical: 16 }} />
          ) : todayCards.length === 0 ? (
            <Text style={{ color: c.textSecondary, lineHeight: 22, fontFamily: fontCute }}>
              오늘 학습할 카드를 모두 완료했어요!{'\n'}내일 새로운 카드로 만나요 🎉
            </Text>
          ) : (
            todayCards.slice(0, 3).map((card) => (
              <View key={card.id} style={{ backgroundColor: c.surfaceAlt, borderRadius: 12, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name={getCategoryIcon(card.category)} size={20} color={c.primary} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Badge label={card.category} />
                  <Text style={{ color: c.textPrimary, fontSize: 14 * fs, fontWeight: '600', marginTop: 4, lineHeight: 20 }} numberOfLines={2}>
                    {card.question}
                  </Text>
                </View>
              </View>
            ))
          )}
        </Card>

        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <Text style={{ color: c.textPrimary, fontSize: 14 * fs, fontWeight: '700', fontFamily: fontCute }}>전체 컨텐츠</Text>
            <Pressable onPress={() => router.push(ROUTES.contents)}>
              <Text style={{ color: c.primary, fontSize: 13 * fs, fontWeight: '600' }}>더보기 →</Text>
            </Pressable>
          </View>
          {cardsError ? (
            <ErrorState message="컨텐츠를 불러올 수 없습니다" onRetry={refetchAll} />
          ) : allCards.length === 0 ? (
            <Text style={{ color: c.textSecondary, lineHeight: 22 }}>아직 등록된 컨텐츠가 없습니다</Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {allCards.slice(0, 6).map((card) => {
                const diff = getDifficultyMeta(theme, card.difficulty);
                return (
                  <Pressable key={card.id} onPress={() => router.push(ROUTES.content(card.id) as any)}
                    style={{ width: '48%', backgroundColor: c.surfaceAlt, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: c.border }}>
                    <Ionicons name={getCategoryIcon(card.category)} size={22} color={c.primary} style={{ marginBottom: 6 }} />
                    <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center', marginBottom: 4 }}>
                      <Badge label={card.category} />
                      <Text style={{ color: diff.color, fontSize: 10, fontWeight: '700' }}>{diff.label}</Text>
                    </View>
                    <Text style={{ color: c.textPrimary, fontSize: 12, fontWeight: '600', lineHeight: 16 }} numberOfLines={3}>
                      {card.question}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </Card>
      </ScrollView>
    </View>
  );
}
