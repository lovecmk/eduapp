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
import { fontMono, fontDisplay, fontBody, fontCute } from '../../src/theme/tokens';
import { calcEmblems, getAcquiredEmblems } from '../../src/utils/emblems';
import { useFactionStore } from '../../src/store/factionStore';
import { computeMoment, encourageLine, type Moment } from '../../src/utils/moments';
import { ROUTES } from '../../src/constants/routes';
import { useAllCards, useTodayCards } from '../../src/hooks/useCards';
import { useStudyStats } from '../../src/hooks/useStats';
import { useReview } from '../../src/hooks/useReview';
import { useDailyQuota } from '../../src/hooks/useDailyQuota';

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
  const { refetch: refetchToday } = useTodayCards();
  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useStudyStats();
  const { dueTodayCount } = useReview();
  const quota = useDailyQuota();

  const masteredCount = useMemo(() => allCards.filter((x) => x.status === 'mastered').length, [allCards]);

  // 앱을 켠 시각에 맞춰 인사·이모지·톤이 바뀐다(히어로 적극 활용).
  // 시간대(아침/저녁)를 '의도적으로 문구로 띄우지 않는다'. 인사·문구는 시간 중립으로 두고,
  // 지금이 언제쯤인지는 아래 해/달 아이콘으로만 은은하게 전한다.
  const greeting = useMemo(() => NEUTRAL_GREETINGS[Math.floor(Math.random() * NEUTRAL_GREETINGS.length)], []);
  // 시간대·날씨는 이제 앱 '전역 배경(WeatherBackground)'이 대신 표현한다.
  // 히어로에는 시간과 무관한 고정 안전 아이콘(방패)을 둔다.
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
    // 배경은 전역 WeatherBackground 가 그린다 — 여기선 투명으로 두어 날씨가 비쳐 보이게.
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
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

        {/* 오늘의 학습 리추얼 — '하루 딱 5장, 3분'을 눈으로 체감하게: 5칸 진행 + 명확한 학습/복습 구분.
            학습은 하루 상한이 있는 '오늘의 목표'(끝이 있는 리추얼), 복습은 언제든 '자유'임을 대비시켜 보여준다. */}
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="school" size={16} color={c.primary} />
              <Text style={{ color: c.textPrimary, fontSize: 14.5 * fs, fontFamily: fontDisplay }}>오늘의 학습</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.surfaceAlt, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 }}>
              <Ionicons name="hourglass-outline" size={11} color={c.textSecondary} />
              <Text style={{ color: c.textSecondary, fontSize: 11 * fs, fontFamily: fontCute, fontWeight: '700' }}>하루 {quota.limit}장 · 3분이면 충분</Text>
            </View>
          </View>

          {/* 5칸 진행 도트 — 채워진 칸 = 오늘 마친 학습. '끝이 보이는' 하루 목표를 시각화. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12, paddingHorizontal: 2 }}>
            {Array.from({ length: quota.limit }).map((_, i) => {
              const done = i < quota.used;
              return (
                <View key={i} style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: done ? c.primary : c.surfaceAlt, borderWidth: done ? 0 : 1, borderColor: c.border }} />
              );
            })}
            <Text style={{ color: quota.canLearn ? c.primary : c.success, fontSize: 12.5 * fs, fontFamily: fontMono, fontWeight: '900', marginLeft: 4, minWidth: 34, textAlign: 'right' }}>{quota.used}/{quota.limit}</Text>
          </View>

          {/* 오늘의 학습 CTA — 진행 중이면 '이어서', 다 하면 축하 상태 */}
          <Pressable onPress={() => router.push(ROUTES.cards)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: quota.canLearn ? c.primary : c.success + '18', borderRadius: 14, padding: 14, borderWidth: quota.canLearn ? 0 : 1, borderColor: c.success + '55' }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: quota.canLearn ? 'rgba(255,255,255,0.2)' : c.success + '22', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={quota.canLearn ? 'play' : 'checkmark-done'} size={20} color={quota.canLearn ? '#fff' : c.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: quota.canLearn ? '#fff' : c.success, fontSize: 15 * fs, fontFamily: fontDisplay }}>{quota.canLearn ? (quota.used > 0 ? '이어서 학습하기' : '오늘 학습 시작') : '오늘 학습 완료! 🎉'}</Text>
              <Text style={{ color: quota.canLearn ? 'rgba(255,255,255,0.85)' : c.textSecondary, fontSize: 11.5 * fs, marginTop: 2, fontFamily: fontCute }}>{quota.canLearn ? `${quota.remaining}장 남았어요 · 무리 말고 딱 오늘 치만` : '내일 자정에 새 5장이 열려요'}</Text>
            </View>
            {quota.canLearn && <Ionicons name="chevron-forward" size={20} color="#fff" />}
          </Pressable>

          {/* 복습 — '언제든 자유'임을 명확히(상한 없음). 대기 개수는 부담이 아니라 '기다리는 카드'로. */}
          <Pressable onPress={() => router.push(ROUTES.review)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: c.border, marginTop: 10 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="refresh" size={20} color={c.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontFamily: fontDisplay }}>복습</Text>
                <View style={{ backgroundColor: c.success + '1A', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1.5 }}>
                  <Text style={{ color: c.success, fontSize: 10.5, fontFamily: fontCute, fontWeight: '800' }}>언제든 자유</Text>
                </View>
              </View>
              <Text style={{ color: c.textSecondary, fontSize: 11.5 * fs, marginTop: 2, fontFamily: fontCute }}>{dueTodayCount > 0 ? `복습할 카드 ${dueTodayCount}장이 기다려요` : '지금은 복습할 카드가 없어요'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={c.primary} />
          </Pressable>
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
              <StatPill value={`${quota.used}/${quota.limit}`} label="오늘 학습" icon="today" />
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
