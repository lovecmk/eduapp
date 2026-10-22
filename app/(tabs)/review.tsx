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
  const savedIds = useBookmarkStore((s) => s.ids);
  const likedIds = useLikeStore((s) => s.ids);
  const reports = useReportStore((s) => s.reports);
  const history = useSrsStore((s) => s.history);

  /**
   * 목록에 실제로 그려질 카드만 센다.
   *
   * 이 화면의 숫자와 그 숫자를 눌러 들어가는 목록(collection/[type])의 출처는 같지만,
   * 목록은 id 를 카드로 바꾸면서 **찾지 못한 것을 걸러 낸다**(`.filter(Boolean)`).
   * 여기서 id 개수를 그대로 세면, 관리자가 카드를 내린 뒤 그 카드를 저장해 둔
   * 사람에게는 "저장 카드 5" 라고 적힌 자리를 눌러 4장짜리 목록이 열린다.
   * 세는 쪽을 목록에 맞춘다 — 화면에 없는 것을 세지 않는다.
   */
  const cardIds = useMemo(() => new Set(allCards.map((x) => x.id)), [allCards]);
  const countExisting = useCallback((ids: string[]) => ids.filter((id) => cardIds.has(id)).length, [cardIds]);

  const savedCount = countExisting(savedIds);
  const likedCount = countExisting(likedIds);
  const reportedCount = countExisting([...new Set(reports.map((r) => r.cardId))]);
  const todayCount = countExisting(history[dateKey(new Date())] ?? []);

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
      {/* 직접 골라 보기 */}
      <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontFamily: fontDisplay, marginBottom: 12 }}>직접 골라 보기</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {collections.map((col) => (
          <Pressable accessibilityRole="button" key={col.type} onPress={() => router.push(ROUTES.collection(col.type) as never)}
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
          <Pressable accessibilityRole="button" onPress={() => router.push(ROUTES.cards)} style={{ marginTop: 18, backgroundColor: c.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 }}>
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
                <Pressable accessibilityRole="button"
                  onPress={() => router.push({ pathname: ROUTES.cards, params: { category: s.category } })}
                  style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}
                >
                  <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: color + '18', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={getCategoryIcon(s.category)} size={24} color={color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontFamily: fontDisplay }}>{s.category}</Text>
                      <Text style={{ color: c.textSecondary, fontSize: 12 * fs, fontFamily: fontMono }}>학습 {s.studied} · 마스터 {s.mastered}</Text>
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
