import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, RefreshControl, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuthStore } from '../../src/store/authStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { Card } from '../../src/components/ui/Card';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { DailyQuestsCard } from '../../src/components/home/DailyQuestsCard';
import { DailyTipCard } from '../../src/components/home/DailyTipCard';
import { LivePresenceStrip } from '../../src/components/community/LivePresenceStrip';
import { LearningCalendar } from '../../src/components/community/LearningCalendar';
import { fontMono, fontDisplay, fontBody } from '../../src/theme/tokens';
import { calcEmblems, getAcquiredEmblems } from '../../src/utils/emblems';
import { ROUTES } from '../../src/constants/routes';
import { useAllCards, useTodayCards } from '../../src/hooks/useCards';
import { useStudyStats } from '../../src/hooks/useStats';
import { useReview } from '../../src/hooks/useReview';

const GREETINGS = [
  '오늘도 3분, 안전을 쌓아요',
  '한 장의 카드가 사고 하나를 막아요',
  '3분 투자로 현장이 달라져요',
  '오늘의 안전, 지금 시작해요',
  '작은 습관이 큰 사고를 막아요',
  '무사고 하루, 오늘도 함께해요',
  '아는 만큼 안전해집니다',
  '잠깐의 점검이 평생을 지켜요',
  '오늘도 안전 한 걸음 나아가요',
  '현장의 안전, 당신의 3분에서 시작돼요',
];

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

  const { data: allCards = [], isLoading: cardsLoading, refetch: refetchAll } = useAllCards();
  const { data: todayCards = [], refetch: refetchToday } = useTodayCards();
  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useStudyStats();
  const { dueTodayCount } = useReview();

  const masteredCount = useMemo(() => allCards.filter((x) => x.status === 'mastered').length, [allCards]);

  const greeting = useMemo(() => GREETINGS[Math.floor(Math.random() * GREETINGS.length)], []);

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
        {/* 오늘의 학습 히어로 */}
        <View style={{ borderRadius: 20, backgroundColor: c.primary, paddingVertical: 22, paddingHorizontal: 18, marginBottom: 14, minHeight: 152, justifyContent: 'center', boxShadow: `0 8px 24px ${c.primary}44` }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {/* 프로필 · 인사 */}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {profileImage ? (
                  <Image source={{ uri: profileImage }} style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)' }} />
                ) : (
                  <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.22)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 20, fontFamily: fontDisplay }}>{user?.name?.charAt(0) ?? '현'}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12.5 * fs, fontFamily: fontBody }}>오늘의 학습</Text>
                  <Text style={{ color: '#fff', fontSize: 18 * fs, marginTop: 1, fontFamily: fontDisplay }} numberOfLines={1}>{user?.name ?? '점검자'} 님</Text>
                </View>
              </View>
              <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 * fs, marginTop: 14, lineHeight: 19, fontFamily: fontBody }}>{greeting}</Text>
              {acquired.length > 0 && (
                <View style={{ flexDirection: 'row', gap: 3, marginTop: 10 }}>
                  {acquired.slice(0, 3).map((em) => <Text key={em.category} style={{ fontSize: 16 }}>{em.emoji}</Text>)}
                </View>
              )}
            </View>

            {/* 캐릭터 */}
            <View style={{ width: 88, height: 88, borderRadius: 44, marginLeft: 10, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 46 }}>👷</Text>
            </View>
          </View>
        </View>

        <LivePresenceStrip />

        {/* 학습 시작 · 복습 */}
        <Card>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={() => router.push(ROUTES.cards)} style={{ flex: 1, backgroundColor: c.primary, borderRadius: 14, paddingVertical: 13, alignItems: 'center', gap: 3 }}>
              <Ionicons name="school" size={20} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 13.5 * fs, fontFamily: fontDisplay }}>학습 시작</Text>
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 10.5, fontFamily: fontMono }}>새 카드 {todayCards.length}</Text>
            </Pressable>
            <Pressable onPress={() => router.push(ROUTES.review)} style={{ flex: 1, backgroundColor: c.surfaceAlt, borderRadius: 14, paddingVertical: 13, alignItems: 'center', gap: 3 }}>
              <View>
                <Ionicons name="refresh" size={20} color={c.primary} />
                {dueTodayCount > 0 && (
                  <View style={{ position: 'absolute', top: -4, right: -8, backgroundColor: c.warning, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
                    <Text style={{ color: '#fff', fontSize: 9, fontFamily: fontMono, fontWeight: '800' }}>{dueTodayCount}</Text>
                  </View>
                )}
              </View>
              <Text style={{ color: c.textPrimary, fontSize: 13.5 * fs, fontFamily: fontDisplay }}>복습</Text>
              <Text style={{ color: c.textSecondary, fontSize: 10.5, fontFamily: fontMono }}>{dueTodayCount > 0 ? `${dueTodayCount}개 대기` : '완료'}</Text>
            </Pressable>
          </View>
        </Card>

        {/* 학습 현황 + 통계 보기 */}
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ color: c.textPrimary, fontSize: 14 * fs, fontFamily: fontDisplay }}>학습 현황</Text>
            <Pressable onPress={() => router.push(ROUTES.stats)} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Text style={{ color: c.primary, fontSize: 12.5 * fs, fontFamily: fontDisplay }}>더보기</Text>
              <Ionicons name="chevron-forward" size={14} color={c.primary} />
            </Pressable>
          </View>
          {statsError ? (
            <ErrorState message="통계를 불러올 수 없습니다" onRetry={refetchStats} />
          ) : (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <StatPill value={`${todayCards.length}개`} label="오늘의 학습" icon="today" />
              <StatPill value={`${stats?.totalLearned ?? masteredCount}개`} label="누적 학습" icon="book" />
              <StatPill value={`${stats?.streakDays ?? '-'}일`} label="연속 학습" icon="flame" />
            </View>
          )}
        </Card>

        {/* 학습 현황 — 학습 히트맵 캘린더 */}
        <LearningCalendar />

        <DailyQuestsCard />
        <DailyTipCard />
      </ScrollView>
    </View>
  );
}
