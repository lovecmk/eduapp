import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, Image, Animated, Easing, BackHandler, Platform, ToastAndroid } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useResponsive } from '../../src/theme/responsive';
import { useAuthStore } from '../../src/store/authStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { useMomentStore } from '../../src/store/momentStore';
import { Card } from '../../src/components/ui/Card';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { MomentModal } from '../../src/components/home/MomentModal';
import { CenterModal } from '../../src/components/ui/CenterModal';
import { useSrsStore } from '../../src/store/srsStore';
import { dateKey } from '../../src/utils/dateKey';
import { HomeSkeleton } from '../../src/components/skeletons';
import { LivePresenceStrip } from '../../src/components/community/LivePresenceStrip';
import { LearningCalendar } from '../../src/components/community/LearningCalendar';
import { fontMono, fontDisplay, fontBody, fontCute } from '../../src/theme/tokens';
import { calcEmblems, getAcquiredEmblems } from '../../src/utils/emblems';
import { useFactionStore } from '../../src/store/factionStore';
import { computeMoment, heroPlayfulCheer, type Moment } from '../../src/utils/moments';
import { ROUTES } from '../../src/constants/routes';
import { useAllCards, useTodayCards } from '../../src/hooks/useCards';
import { useStudyStats } from '../../src/hooks/useStats';
import { useReview } from '../../src/hooks/useReview';
import { useDailyQuota } from '../../src/hooks/useDailyQuota';
import { DAILY_TOTAL_LIMIT } from '../../src/constants/learning';
import { contentColumn } from '../../src/theme/layout';

// 홈 히어로 고정 문구 — 앱의 미션을 한 줄로.
// 히어로 텍스트 열은 오른쪽 실드 아이콘 때문에 폭이 좁아, 한 문장으로 두면
// '지켜/요!' 처럼 단어 중간에서 잘린다. 의미 단위로 끊어 2줄 락업으로 고정한다.
const HERO_TAGLINE_LINES = ['하루 3분이 모여', '국민의 안전한 내일을 지켜요!'];
const HERO_TAGLINE = HERO_TAGLINE_LINES.join(' ');

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
  // 실제로 지금 배울 수 있는 '신규' 카드 수 — 하루 상한과 별개로 풀이 비었는지 확인용.
  // (상한은 남았지만 새 카드가 없으면 '학습 시작' 버튼이 빈 화면으로 이어지던 어긋남 방지.)
  const newAvailable = useMemo(() => allCards.filter((x) => x.status === 'new').length, [allCards]);

  // 앱을 켠 시각에 맞춰 인사·이모지·톤이 바뀐다(히어로 적극 활용).
  // 시간대(아침/저녁)를 '의도적으로 문구로 띄우지 않는다'. 인사·문구는 시간 중립으로 두고,
  // 지금이 언제쯤인지는 아래 해/달 아이콘으로만 은은하게 전한다.
  const greeting = HERO_TAGLINE;
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
  const cheer = useMemo(
    () => heroPlayfulCheer({ totalLearned, streakDays, todayDone: 0, dueToday: dueTodayCount }),
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

  // 홈 첫 팝업 — '오늘(00:00~23:59) 학습 이력이 있을 때만' 이어서 학습할지 물어본다.
  // (학습을 시작하지 않은 날에는 아무 팝업도 띄우지 않는다. 축하 순간 팝업도 이때만 노출.)
  const [resumeOpen, setResumeOpen] = useState(false);
  useEffect(() => {
    if (sessionMomentHandled || !stats || !sessionBaseline) return;
    // 진영 하이드레이트 전이거나 아직 진영을 안 골랐으면(=진영 선택 화면이 뜨는 상황)
    // '이어서 학습' 팝업을 띄우지 않는다. 진영 선택은 가입/최초 진입 흐름이라
    // 그 위에 학습 이어가기 팝업이 겹쳐 뜨면 안 된다.
    if (!factionHydrated || faction === null) return;
    sessionMomentHandled = true;
    const learnedToday = (useSrsStore.getState().history[dateKey(new Date())] ?? []).length;
    if (learnedToday === 0) return; // 오늘 학습 이력이 없으면 팝업 없음.
    setResumeOpen(true);
  }, [stats, factionHydrated, faction]);

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

  // 홈(앱의 루트 탭)에서의 하드웨어 뒤로가기 UX 정리.
  // 기존엔 탭 네비게이터의 backBehavior="history" 때문에 홈에서 뒤로가기를 누르면
  // '직전에 보던 탭(예: 학습카드)'으로 되돌아가, 앱 밖으로 나가려는 사용자를 앱 안으로 되돌렸다.
  // 홈은 더 이상 되돌아갈 곳이 없는 최상위 화면이므로, 여기서 뒤로가기는 '앱 종료'가 자연스럽다.
  // 실수 종료를 막기 위해 안드로이드 관례대로 '한 번 더 누르면 종료'(2초 내 재입력) 방식을 쓴다.
  const lastBackPressRef = useRef(0);
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      const onBack = () => {
        const now = Date.now();
        if (now - lastBackPressRef.current < 2000) {
          BackHandler.exitApp();
          return true;
        }
        lastBackPressRef.current = now;
        ToastAndroid.show('뒤로가기를 한 번 더 누르면 종료돼요', ToastAndroid.SHORT);
        return true; // 기본 동작(학습카드 등 이전 탭으로 이동) 차단
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, []),
  );

  if (statsLoading && !stats && cardsLoading && allCards.length === 0) {
    return <HomeSkeleton />;
  }

  return (
    // 배경은 전역 WeatherBackground 가 그린다 — 여기선 투명으로 두어 날씨가 비쳐 보이게.
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
        contentContainerStyle={{ padding: 20, ...contentColumn }}
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
              <View style={{ marginTop: 14 }} accessible accessibilityLabel={greeting}>
                {HERO_TAGLINE_LINES.map((line) => (
                  <Text key={line} numberOfLines={1} style={{ color: 'rgba(255,255,255,0.92)', fontSize: rs(13) * fs, lineHeight: rs(19) * fs, fontFamily: fontBody }}>{line}</Text>
                ))}
              </View>
              {/* 플레이풀 응원 스티커 — 격언(명언) 톤 대신, 이모지 '스티커 배지 + 짤막한 한 줄'로
                  가볍고 재밌게. 태그라인과 컨셉이 겹치지 않도록 게임형 진행 응원을 돌린다. */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'flex-start', maxWidth: '100%', borderRadius: 12, paddingLeft: 5, paddingRight: 11, paddingVertical: 5 }}>
                <View style={{ width: rs(24), height: rs(24), borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.28)', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: rs(13) }}>{cheer.emoji}</Text>
                </View>
                <Text style={{ color: '#fff', fontSize: rs(11.5) * fs, lineHeight: rs(16) * fs, fontFamily: fontBody, flexShrink: 1 }} numberOfLines={2}>{cheer.text}</Text>
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
              <Text style={{ color: c.textSecondary, fontSize: 11 * fs, fontFamily: fontCute, fontWeight: '700' }}>신규 {quota.limit} · 복습 포함 최대 {DAILY_TOTAL_LIMIT}장</Text>
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

          {/* 오늘의 학습 CTA — 신규(≤남은 상한) + 복습(도래)을 한 번에 이어서 진행.
              버튼 한 개로 단순화(복습은 오늘의 학습에 자동 편입). 오늘 담길 신규/복습 개수를 정직하게 표기. */}
          {(() => {
            const newToStudy = Math.min(quota.remaining, newAvailable);
            const reviewToStudy = Math.min(dueTodayCount, Math.max(0, DAILY_TOTAL_LIMIT - newToStudy));
            const sessionCount = newToStudy + reviewToStudy;
            const countLine = `신규 ${newToStudy} · 복습 ${reviewToStudy} · 3분이면 충분`;
            const cta = sessionCount > 0
              ? { to: ROUTES.cards, bg: c.primary, fg: '#fff', sub: 'rgba(255,255,255,0.85)', iconBg: 'rgba(255,255,255,0.2)', iconColor: '#fff', icon: 'play' as const, bw: 0, border: 'transparent', chevron: true,
                  title: quota.used > 0 ? '이어서 학습하기' : '오늘 학습 시작', desc: countLine }
              : quota.remaining === 0
                ? { to: ROUTES.stats, bg: c.success + '18', fg: c.success, sub: c.textSecondary, iconBg: c.success + '22', iconColor: c.success, icon: 'checkmark-done' as const, bw: 1, border: c.success + '55', chevron: false,
                    title: '오늘 학습 완료! 🎉', desc: '내일 자정에 새 학습이 열려요' }
                : { to: ROUTES.contents, bg: c.surfaceAlt, fg: c.textPrimary, sub: c.textSecondary, iconBg: c.surface, iconColor: c.primary, icon: 'sparkles' as const, bw: 1, border: c.border, chevron: true,
                    title: '새 카드를 다 배웠어요', desc: '지금은 학습할 카드가 없어요 · 곧 새 카드가 열려요' };
            return (
              <Pressable accessibilityRole="button" onPress={() => router.push(cta.to as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: cta.bg, borderRadius: 14, paddingVertical: 22, paddingHorizontal: 16, borderWidth: cta.bw, borderColor: cta.border }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: cta.iconBg, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={cta.icon} size={20} color={cta.iconColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: cta.fg, fontSize: 15 * fs, fontFamily: fontDisplay }}>{cta.title}</Text>
                  <Text style={{ color: cta.sub, fontSize: 11.5 * fs, marginTop: 2, fontFamily: fontCute }}>{cta.desc}</Text>
                </View>
                {cta.chevron && <Ionicons name="chevron-forward" size={20} color={cta.fg} />}
              </Pressable>
            );
          })()}
        </Card>

        {/* 학습 현황 + 통계 보기 */}
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ color: c.textPrimary, fontSize: 14 * fs, fontFamily: fontDisplay }}>학습 현황</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push(ROUTES.stats)} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
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
      </ScrollView>

      {/* 앱을 켠 순간의 축하·격려 (알림 off 사용자도 인앱으로 챙김) */}
      <MomentModal moment={moment} onClose={dismissMoment} onAction={momentAction} />

      {/* 오늘 학습 이력이 있을 때만 뜨는 '이어서 학습/홈에 머물기' 팝업 */}
      <CenterModal visible={resumeOpen} onClose={() => setResumeOpen(false)} title="오늘 학습을 이어갈까요?" icon="play-circle-outline">
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: c.textSecondary, fontSize: 13.5 * fs, textAlign: 'center', lineHeight: 20, marginBottom: 20, fontFamily: fontBody }}>
            오늘 학습을 시작했어요.{'\n'}이어서 마저 학습할까요?
          </Text>
          <Pressable accessibilityRole="button"
            onPress={() => { setResumeOpen(false); router.push(ROUTES.cards); }}
            style={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.primary, borderRadius: 14, paddingVertical: 14 }}
          >
            <Ionicons name="play" size={18} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 15 * fs, fontWeight: '800', fontFamily: fontCute }}>이어서 학습하기</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setResumeOpen(false)} style={{ paddingVertical: 14 }}>
            <Text style={{ color: c.textSecondary, fontSize: 14 * fs, fontFamily: fontDisplay }}>홈에 머물기</Text>
          </Pressable>
        </View>
      </CenterModal>
    </View>
  );
}
