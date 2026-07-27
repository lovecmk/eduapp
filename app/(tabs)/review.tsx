import React, { useCallback, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '../../src/theme/ThemeProvider';
import { ReviewSkeleton } from '../../src/components/skeletons';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { fontDisplay, fontBody, fontMono } from '../../src/theme/tokens';
import { getCategoryIcon, getCategoryColor } from '../../src/constants/categories';
import { ROUTES } from '../../src/constants/routes';
import { usePullToRefresh } from '../../src/hooks/usePullToRefresh';
import { useAllCards } from '../../src/hooks/useCards';
import { useBookmarkStore } from '../../src/store/bookmarkStore';
import { useLikeStore } from '../../src/store/likeStore';
import { useReportStore } from '../../src/store/reportStore';
import { buildReviewPlan } from '../../src/domain/reviewPlan';
import { ReviewPlanCard } from '../../src/components/review/ReviewPlanCard';
import { UpcomingStrip } from '../../src/components/review/UpcomingStrip';
import { useSrsStore } from '../../src/store/srsStore';
import { dateKey } from '../../src/utils/dateKey';
import { contentColumn } from '../../src/theme/layout';

interface CategoryStat {
  category: string;
  total: number;
  studied: number; // learning + mastered
  mastered: number;
  lastStudied: boolean;
}

export default function ReviewScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();

  const { data: allCards = [], isLoading, error, refetch } = useAllCards();
  // 목록 화면에서 아래로 당기는 것은 학습된 기대다. 없으면 '멈춘 화면'처럼 느껴진다.
  const { refreshing, onRefresh } = usePullToRefresh(refetch);
  const savedCount = useBookmarkStore((s) => s.ids.length);
  const likedCount = useLikeStore((s) => s.ids.length);
  const reportedCount = useReportStore((s) => new Set(s.reports.map((r) => r.cardId)).size);
  const history = useSrsStore((s) => s.history);
  const todayCount = (history[dateKey(new Date())] ?? []).length;

  // 내가 "학습했던" 카테고리 = 새 카드가 아닌(학습/마스터) 카드가 하나라도 있는 카테고리.
  const studiedCategories = useMemo<CategoryStat[]>(() => {
    const map = new Map<string, CategoryStat>();
    for (const card of allCards) {
      const s = map.get(card.category) ?? { category: card.category, total: 0, studied: 0, mastered: 0, lastStudied: false };
      s.total += 1;
      if (card.status !== 'new') s.studied += 1;
      if (card.status === 'mastered') s.mastered += 1;
      map.set(card.category, s);
    }
    return [...map.values()].filter((s) => s.studied > 0).sort((a, b) => b.studied - a.studied);
  }, [allCards]);

  const masteredCount = useMemo(() => allCards.filter((x) => x.status === 'mastered').length, [allCards]);
  const learningCount = useMemo(() => allCards.filter((x) => x.status === 'learning').length, [allCards]);
  // 복습 계획 — 무엇을 시킬지는 화면이 아니라 도메인이 정한다.
  const srsCards = useSrsStore((st) => st.cards);
  const plan = useMemo(() => buildReviewPlan(allCards, srsCards), [allCards, srsCards]);

  // 복습 큐 세션으로 들어간다. 계획이 정한 순서 그대로 푼다.
  const startReview = useCallback(() => {
    router.push({ pathname: ROUTES.cards, params: { mode: 'due' } });
  }, [router]);

  // 복습 진행률(마스터/전체) — 요약 게이지.
  const overallPct = allCards.length > 0 ? Math.round((masteredCount / allCards.length) * 100) : 0;

  const collections = [
    { type: 'today', label: '오늘 학습한 카드', icon: 'today' as const, color: c.success, count: todayCount },
    { type: 'mastered', label: '학습 완료 카드', icon: 'checkmark-done' as const, color: c.primary, count: masteredCount },
    { type: 'learning', label: '한번 더 학습', icon: 'refresh' as const, color: c.warning, count: learningCount },
    { type: 'saved', label: '저장 카드', icon: 'bookmark' as const, color: '#8B5CF6', count: savedCount },
    { type: 'liked', label: '좋아요한 카드', icon: 'heart' as const, color: c.error, count: likedCount },
    { type: 'reported', label: '신고한 카드', icon: 'flag' as const, color: '#EF4444', count: reportedCount },
  ];

  if (isLoading && allCards.length === 0 && !error) {
    return <ReviewSkeleton />;
  }
  if (error && allCards.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <ErrorState message="복습 카드를 불러올 수 없어요" onRetry={refetch} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: 'transparent' }}
      contentContainerStyle={{ padding: 20, ...contentColumn }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} colors={[c.primary]} />
      }
    >
      {/* ── 오늘의 복습 — 고르게 하는 화면이 아니라 '먼저 권하는' 화면 ──────────
          간격반복 엔진은 어떤 카드를 지금 봐야 하는지 이미 알고 있다. 그런데 예전에는
          그 답을 쓰지 않고 '오늘 배운 것/약점 분야'처럼 고를 거리만 늘어놓았다.
          앱이 아는 답을 두고 사용자에게 매번 결정을 떠넘긴 셈이라 복습에 의도가 없었다.
          이제는 계획(reviewPlan)이 정한 한 가지를 크게 제시한다.

          다만 제시일 뿐 강제가 아니다. 복습을 할지 말지는 사용자가 정한다.
          그래서 이 카드는 화면을 가로막지 않고, 바로 아래에 '직접 골라 보기'가
          그대로 남아 있다. 권하는 길과 고르는 길이 나란히 있어야 선택이 된다. */}
      <View style={{ marginBottom: 22 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <Ionicons name="flash" size={16} color={c.primary} />
          <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontFamily: fontDisplay }}>오늘의 복습</Text>
        </View>

        <ReviewPlanCard plan={plan} onStart={startReview} />

        {/* 앞으로 7일 — 오늘 보지 않아도 '내일 또 올 이유'가 보여야 한다. */}
        <UpcomingStrip days={plan.upcoming} />

        {/* 마스터 진행 게이지 — 전체 여정에서 지금 어디쯤인지. */}
        <View style={{ marginTop: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text style={{ color: c.textSecondary, fontSize: 11.5 * fs, fontFamily: fontBody }}>전체 진행</Text>
            <Text style={{ color: c.textSecondary, fontSize: 11.5 * fs, fontFamily: fontMono }}>
              마스터 {masteredCount}/{allCards.length} ({overallPct}%)
            </Text>
          </View>
          <View style={{ height: 6, backgroundColor: c.surfaceAlt, borderRadius: 3, overflow: 'hidden' }}>
            <View style={{ width: `${overallPct}%`, height: '100%', backgroundColor: c.success, borderRadius: 3 }} />
          </View>
        </View>
      </View>

      {/* 직접 골라 보기 — 계획 밖에서 스스로 찾아볼 때만 쓴다.
          제목을 '모아 보기'에서 바꾼 이유: 위가 '해야 할 것', 아래가 '보고 싶은 것'임을
          이름만으로도 구분되게 하기 위해서다. */}

      <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontFamily: fontDisplay, marginBottom: 12 }}>직접 골라 보기</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {collections.map((col) => (
          <Pressable key={col.type} onPress={() => router.push(ROUTES.collection(col.type) as never)}
            style={{ width: '47%', flexGrow: 1, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 16, padding: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: col.color + '18', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={col.icon} size={19} color={col.color} />
              </View>
              <Text style={{ color: col.color, fontSize: 20 * fs, fontFamily: fontMono, fontWeight: '900' }}>{col.count}</Text>
            </View>
            <Text style={{ color: c.textPrimary, fontSize: 13.5 * fs, fontFamily: fontDisplay }}>{col.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* 분야별 보기 */}
      <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontFamily: fontDisplay, marginTop: 26, marginBottom: 12 }}>분야별 보기</Text>
      {studiedCategories.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Ionicons name="albums-outline" size={38} color={c.textSecondary} />
          </View>
          <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontFamily: fontDisplay }}>아직 학습한 카테고리가 없어요</Text>
          <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, marginTop: 6, textAlign: 'center', fontFamily: fontBody }}>
            학습 탭에서 카드를 학습하면{'\n'}여기에서 카테고리별로 복습할 수 있어요
          </Text>
          <Pressable onPress={() => router.push(ROUTES.cards)} style={{ marginTop: 18, backgroundColor: c.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 }}>
            <Text style={{ color: '#fff', fontSize: 14 * fs, fontFamily: fontDisplay }}>학습 시작하기</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {studiedCategories.map((s, i) => {
            const color = getCategoryColor(s.category) ?? c.primary;
            const pct = s.total > 0 ? Math.round((s.mastered / s.total) * 100) : 0;
            return (
              <Animated.View key={s.category} entering={FadeInDown.delay(i * 60).duration(280)}>
                <Pressable
                  onPress={() => router.push({ pathname: ROUTES.cards, params: { category: s.category } })}
                  style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}
                >
                  <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: color + '18', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={getCategoryIcon(s.category)} size={24} color={color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontFamily: fontDisplay }}>{s.category}</Text>
                      <Text style={{ color: c.textSecondary, fontSize: 12, fontFamily: fontMono }}>학습 {s.studied} · 마스터 {s.mastered}</Text>
                    </View>
                    <View style={{ height: 6, backgroundColor: c.surfaceAlt, borderRadius: 3, overflow: 'hidden' }}>
                      <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: 3 }} />
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={c.textSecondary} />
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}
