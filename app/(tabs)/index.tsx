import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, Image, Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useResponsive } from '../../src/theme/responsive';
import { useAuthStore } from '../../src/store/authStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { useMomentStore } from '../../src/store/momentStore';
import { Card } from '../../src/components/ui/Card';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { DailyQuestsCard } from '../../src/components/home/DailyQuestsCard';
import { DailyTipCard } from '../../src/components/home/DailyTipCard';
import { MomentModal } from '../../src/components/home/MomentModal';
import { HomeSkeleton } from '../../src/components/skeletons';
import { LivePresenceStrip } from '../../src/components/community/LivePresenceStrip';
import { LearningCalendar } from '../../src/components/community/LearningCalendar';
import { fontMono, fontDisplay, fontBody } from '../../src/theme/tokens';
import { calcEmblems, getAcquiredEmblems } from '../../src/utils/emblems';
import { getDaylight } from '../../src/utils/daylight';
import { AmbientSky } from '../../src/components/home/AmbientSky';
import { useWeather } from '../../src/hooks/useWeather';
import { useFactionStore } from '../../src/store/factionStore';
import { computeMoment, encourageLine, type Moment } from '../../src/utils/moments';
import { ROUTES } from '../../src/constants/routes';
import { useAllCards, useTodayCards } from '../../src/hooks/useCards';
import { useStudyStats } from '../../src/hooks/useStats';
import { useReview } from '../../src/hooks/useReview';

// 시간 중립 인사 문구 — '아침/저녁'을 직접 말하지 않고, 시간대는 해/달 아이콘으로만 전한다.
const NEUTRAL_GREETINGS = [
  '가볍게 한 장, 오늘도 안전 첫걸음이에요',
  '3분이면 충분해요 — 지금 한 장 어때요?',
  '오늘의 안전, 한 장으로 채워가요',
  '짧게 한 장으로 현장을 더 안전하게',
  '오늘도 무사고 — 한 장으로 시작해요',
];

// 앱 실행(런치)당 1회만 실행 기록/축하 계산이 일어나도록 하는 모듈 가드.
// (홈 탭을 오갈 때 컴포넌트가 재마운트돼도 중복 카운트/중복 팝업을 막는다.)
let sessionBaseline: { firstOpenAt: string | null; totalOpens: number; lastOpenAt: string | null; celebrated: string[] } | null = null;
let sessionMomentHandled = false;

function StatPill({ value, label, icon }: { value: string; label: string; icon?: keyof typeof Ionicons.glyphMap }) {
  const { theme, fontScale } = useTheme();
  const { rs } = useResponsive();
  const c = theme.colors;
  return (
    <Pressable style={{ flex: 1, backgroundColor: c.surfaceAlt, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center' }}>
      {icon && <Ionicons name={icon} size={rs(14)} color={c.warning} style={{ marginBottom: 2 }} />}
      <Text numberOfLines={1} style={{ color: c.primary, fontSize: rs(20) * fontScale, fontWeight: '900', fontFamily: fontMono }}>{value}</Text>
      <Text numberOfLines={1} style={{ color: c.textSecondary, fontSize: rs(11) * fontScale, marginTop: 3, fontFamily: fontBody }}>{label}</Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const { theme, fontScale: fs } = useTheme();
  const { rs } = useResponsive();
  const c = theme.colors;
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const profileImage = useSettingsStore((s) => s.profileImage);
  const [refreshing, setRefreshing] = useState(false);
  const [moment, setMoment] = useState<Moment | null>(null);

  const { data: allCards = [], isLoading: cardsLoading, refetch: refetchAll } = useAllCards();
  const { data: todayCards = [], refetch: refetchToday } = useTodayCards();
  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useStudyStats();
  const { dueTodayCount } = useReview();

  const masteredCount = useMemo(() => allCards.filter((x) => x.status === 'mastered').length, [allCards]);

  // 앱을 켠 시각에 맞춰 인사·이모지·톤이 바뀐다(히어로 적극 활용).
  // 시간대(아침/저녁)를 '의도적으로 문구로 띄우지 않는다'. 인사·문구는 시간 중립으로 두고,
  // 지금이 언제쯤인지는 아래 해/달 아이콘으로만 은은하게 전한다.
  const greeting = useMemo(() => NEUTRAL_GREETINGS[Math.floor(Math.random() * NEUTRAL_GREETINGS.length)], []);
  // 시간대 4단계 — 이제 '문구/히어로 아이콘'이 아니라 홈 '배경(AmbientSky)'으로만 표현한다.
  // 히어로에는 시간과 무관한 고정 안전 아이콘(방패)을 둔다.
  const daylight = useMemo(() => getDaylight(), []);
  // 날씨 — 배경 앰비언트(비/눈/맑음) 구동용. 실패해도 조용히 시간대 효과만 남는다.
  const { data: weather } = useWeather();
  // 아주 미세한 효과 — 히어로 안전 아이콘이 천천히 숨쉬듯 은은하게 빛난다(느린 루프).
  const glowAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 2800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [glowAnim]);
  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] });
  const glowScale = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });

  // 진영(팀) 선택 — 가입/최초 진입 후 홈에서 아직 진영이 없으면 한 번 선택하도록 안내.
  // ⚠️ persist 는 비동기로 하이드레이트되므로, 하이드레이트 완료 전에는 faction 이 잠깐 null 이다.
  //    이때 트리거하면 이미 진영을 고른 사용자도 매번 선택화면으로 튕기므로, 하이드레이트 후에만 판단한다.
  const faction = useFactionStore((s) => s.faction);
  const factionPromptedRef = useRef(false);
  const [factionHydrated, setFactionHydrated] = useState(() => useFactionStore.persist.hasHydrated());
  useEffect(() => {
    if (useFactionStore.persist.hasHydrated()) { setFactionHydrated(true); return; }
    const unsub = useFactionStore.persist.onFinishHydration(() => setFactionHydrated(true));
    return unsub;
  }, []);
  useEffect(() => {
    if (factionHydrated && user && faction === null && !factionPromptedRef.current) {
      factionPromptedRef.current = true;
      router.push(ROUTES.factionSelect as never);
    }
  }, [factionHydrated, user, faction, router]);
  const totalLearned = stats?.totalLearned ?? masteredCount;
  const streakDays = stats?.streakDays ?? 0;
  const encourage = useMemo(
    () => encourageLine({ totalLearned, streakDays, todayDone: 0, dueToday: dueTodayCount }),
    [totalLearned, streakDays, dueTodayCount],
  );

  // 런치당 1회: 실행 기록 + 이전 상태 스냅샷 확보(축하 순간 계산 기준).
  useEffect(() => {
    if (!sessionBaseline) {
      const ms = useMomentStore.getState();
      sessionBaseline = {
        firstOpenAt: ms.firstOpenAt,
        totalOpens: ms.totalOpens,
        lastOpenAt: ms.lastOpenAt,
        celebrated: [...ms.celebrated],
      };
      ms.recordOpen();
    }
  }, []);

  // 통계가 준비되면 이번 실행에서 보여줄 축하/격려 순간을 1회 계산한다.
  useEffect(() => {
    if (sessionMomentHandled || !stats || !sessionBaseline) return;
    sessionMomentHandled = true;
    const m = computeMoment({
      totalLearned: stats.totalLearned,
      streakDays: stats.streakDays,
      firstOpenAt: sessionBaseline.firstOpenAt,
      totalOpens: sessionBaseline.totalOpens,
      lastOpenAt: sessionBaseline.lastOpenAt,
      celebrated: sessionBaseline.celebrated,
    });
    if (m) setMoment(m);
  }, [stats]);

  const dismissMoment = useCallback(() => {
    if (moment) useMomentStore.getState().markCelebrated(moment.key);
    setMoment(null);
  }, [moment]);

  const momentAction = useCallback(() => {
    if (moment) useMomentStore.getState().markCelebrated(moment.key);
    setMoment(null);
    router.push(ROUTES.cards);
  }, [moment, router]);

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
    return <HomeSkeleton />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* 시간대 + 날씨 배경 앰비언트 — 아침 햇살 / 노을 / 밤하늘 / 비·눈을 은은히 표현.
          (실제 날씨 API 는 추후 연동. 그전까지는 시간대 효과 위주로 담백하게.) */}
      <AmbientSky phase={daylight.phase} condition={weather?.condition} />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
        contentContainerStyle={{ padding: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* 오늘의 학습 히어로 — 앱을 켠 시각에 따라 인사·이모지·톤이 달라진다 */}
        <View style={{ borderRadius: rs(22), backgroundColor: c.primary, paddingVertical: rs(20), paddingHorizontal: rs(18), marginBottom: 14, minHeight: rs(160), justifyContent: 'center', boxShadow: `0 8px 24px ${c.primary}44` }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {/* 프로필 · 인사 */}
            <View style={{ flex: 1, paddingRight: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {profileImage ? (
                  <Image source={{ uri: profileImage }} style={{ width: rs(48), height: rs(48), borderRadius: rs(24), borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)' }} />
                ) : (
                  <View style={{ width: rs(48), height: rs(48), borderRadius: rs(24), backgroundColor: 'rgba(255,255,255,0.22)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: rs(20), fontFamily: fontDisplay }}>{user?.name?.charAt(0) ?? '현'}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: rs(12.5) * fs, fontFamily: fontBody }} numberOfLines={1}>오늘도 반가워요</Text>
                  <Text style={{ color: '#fff', fontSize: rs(18) * fs, marginTop: 1, fontFamily: fontDisplay }} numberOfLines={1}>{user?.name ?? '점검자'} 님</Text>
                </View>
              </View>
              <Text style={{ color: 'rgba(255,255,255,0.92)', fontSize: rs(13) * fs, marginTop: 14, lineHeight: rs(19) * fs, fontFamily: fontBody }}>{greeting}</Text>
              {/* 몰입·격려 한 줄 (알림을 꺼둬도 앱에서 챙겨주는 응원) */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 9, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'flex-start', maxWidth: '100%', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5 }}>
                <Text style={{ color: '#fff', fontSize: rs(11.5) * fs, lineHeight: rs(16) * fs, fontFamily: fontBody, flexShrink: 1 }} numberOfLines={2}>{encourage}</Text>
              </View>
              {acquired.length > 0 && (
                <View style={{ flexDirection: 'row', gap: 3, marginTop: 10 }}>
                  {acquired.slice(0, 3).map((em) => <Text key={em.category} style={{ fontSize: rs(16) }}>{em.emoji}</Text>)}
                </View>
              )}
            </View>

            {/* 히어로 상징 — 시간과 무관한 고정 '안전(방패)' 아이콘.
                시간대·날씨는 화면 배경(AmbientSky)이 대신 전한다.
                아주 미세하게 숨쉬듯 은은한 글로우 효과만 준다. */}
            <View style={{ width: rs(84), height: rs(84), marginLeft: 8, alignSelf: 'flex-start', marginTop: rs(24), alignItems: 'center', justifyContent: 'center' }}>
              <Animated.View style={{ position: 'absolute', width: rs(84), height: rs(84), borderRadius: rs(42), backgroundColor: 'rgba(255,255,255,0.9)', opacity: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.22] }), transform: [{ scale: glowScale }] }} />
              <Animated.View style={{ width: rs(70), height: rs(70), borderRadius: rs(35), backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.30)', alignItems: 'center', justifyContent: 'center', opacity: glowOpacity, transform: [{ scale: glowScale }] }}>
                <Ionicons name="shield-checkmark" size={rs(38)} color="#fff" />
              </Animated.View>
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

        {/* 학습 히트맵 캘린더 — 출석 도장 체크인을 캘린더에 통합 */}
        <LearningCalendar />

        <DailyQuestsCard />
        <DailyTipCard />
      </ScrollView>

      {/* 앱을 켠 순간의 축하·격려 (알림 off 사용자도 인앱으로 챙김) */}
      <MomentModal moment={moment} onClose={dismissMoment} onAction={momentAction} />
    </View>
  );
}
