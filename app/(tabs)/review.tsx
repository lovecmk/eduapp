import React, { useMemo } from 'react';
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
import { useReview } from '../../src/hooks/useReview';
import { useBookmarkStore } from '../../src/store/bookmarkStore';
import { useLikeStore } from '../../src/store/likeStore';
import { useReportStore } from '../../src/store/reportStore';
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
  const { dueTodayCount } = useReview();

  // 약점 집중 복습 대상 — '한번 더 학습(learning)' 카드가 가장 많은 분야(자주 잊는 곳부터).
  const weakestCategory = useMemo(() => {
    let best: { category: string; learning: number } | null = null;
    for (const s of studiedCategories) {
      const learning = s.studied - s.mastered;
      if (learning > 0 && (!best || learning > best.learning)) best = { category: s.category, learning };
    }
    return best;
  }, [studiedCategories]);

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
      {/* ── 오늘의 복습 (효율 우선 추천) ─────────────────────────────────
          복습은 '무엇을' 다시 볼지가 중요하다. 두 개의 검증된 방식을 크게 제시한다:
           · 당일 복습(방금 배운 것 회상) — 초기 망각 구간 방어(테스트 효과)
           · 약점 집중 복습(자주 잊는 분야부터) — 취약 지점 반복이 효율이 가장 높다 */}
      <View style={{ marginBottom: 22 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <Ionicons name="flash" size={16} color={c.primary} />
          <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontFamily: fontDisplay }}>오늘의 복습</Text>
        </View>
        <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, marginBottom: 12, fontFamily: fontBody }}>
          가장 효율적인 순서로 골라뒀어요 · 마스터 {masteredCount}/{allCards.length} ({overallPct}%)
        </Text>
        {/* 마스터 진행 게이지 */}
        <View style={{ height: 6, backgroundColor: c.surfaceAlt, borderRadius: 3, overflow: 'hidden', marginBottom: 14 }}>
          <View style={{ width: `${overallPct}%`, height: '100%', backgroundColor: c.success, borderRadius: 3 }} />
        </View>

        <View style={{ gap: 10 }}>
          {/* 1) 당일 복습 — 오늘 배운 카드를 바로 다시 보기 */}
          <Pressable
            onPress={() => router.push(ROUTES.collection('today') as never)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.primary, borderRadius: 16, padding: 16, boxShadow: '0 6px 16px rgba(37,99,235,0.24)' }}
          >
            <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="today" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontSize: 15 * fs, fontFamily: fontDisplay }}>오늘 학습 복습</Text>
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 * fs, marginTop: 2, fontFamily: fontBody }}>
                {todayCount > 0 ? `방금 배운 ${todayCount}장을 한 번 더 (오래 기억돼요)` : '오늘 학습하면 여기서 바로 복습해요'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#fff" />
          </Pressable>

          {/* 2) 약점 집중 복습 — 자주 잊는 분야부터 */}
          <Pressable
            onPress={() => weakestCategory
              ? router.push({ pathname: ROUTES.cards, params: { category: weakestCategory.category } })
              : router.push(ROUTES.cards)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: c.border }}
          >
            <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: c.warning + '18', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="barbell" size={22} color={c.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontFamily: fontDisplay }}>약점 집중 복습</Text>
              <Text style={{ color: c.textSecondary, fontSize: 12 * fs, marginTop: 2, fontFamily: fontBody }}>
                {weakestCategory ? `${weakestCategory.category} · 다시 볼 ${weakestCategory.learning}장부터` : '자주 잊는 카드부터 · 학습을 시작해보세요'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={c.textSecondary} />
          </Pressable>
        </View>
      </View>

      {/* 모아 보기 — 종류별로 원할 때 골라 보기 */}
      <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontFamily: fontDisplay, marginBottom: 12 }}>모아 보기</Text>
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
