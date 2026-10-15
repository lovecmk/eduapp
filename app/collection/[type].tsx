import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, TextInput, FlatList, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { resolveCardImage } from '../../src/data/cardImages';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useTheme } from '../../src/theme/ThemeProvider';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { CardListSkeleton } from '../../src/components/skeletons';
import { CategoryTrail } from '../../src/components/ui/CategoryTrail';
import { fontDisplay, fontBody } from '../../src/theme/tokens';
import { getCategoryIcon, getCategoryColor } from '../../src/constants/categories';
import { getDifficultyMeta } from '../../src/constants/difficulty';
import { ROUTES } from '../../src/constants/routes';
import { useAllCards } from '../../src/hooks/useCards';
import { usePullToRefresh } from '../../src/hooks/usePullToRefresh';
import { useBookmarkStore } from '../../src/store/bookmarkStore';
import { useLikeStore } from '../../src/store/likeStore';
import { useReportStore, REPORT_REASON_LABEL, type CardReport } from '../../src/store/reportStore';
import { useSrsStore } from '../../src/store/srsStore';
import { dateKey } from '../../src/utils/dateKey';
import type { LearningCard } from '../../src/domain/models/LearningCard';

type CollectionType = 'today' | 'mastered' | 'learning' | 'saved' | 'liked' | 'reported';
const TYPES: CollectionType[] = ['today', 'mastered', 'learning', 'saved', 'liked', 'reported'];

const META: Record<CollectionType, { title: string; icon: keyof typeof Ionicons.glyphMap; empty: string }> = {
  today: { title: '오늘 학습한 카드', icon: 'today', empty: '아직 오늘 학습한 카드가 없어요' },
  mastered: { title: '학습 완료 카드', icon: 'checkmark-done', empty: '아직 학습 완료한 카드가 없어요' },
  learning: { title: '한번 더 학습 카드', icon: 'refresh', empty: '다시 볼 카드가 없어요' },
  saved: { title: '저장한 카드', icon: 'bookmark', empty: '저장한 카드가 없어요' },
  liked: { title: '좋아요한 카드', icon: 'heart', empty: '아직 좋아요한 카드가 없어요' },
  reported: { title: '신고한 카드', icon: 'flag', empty: '신고한 카드가 없어요' },
};

export default function CollectionScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const params = useLocalSearchParams<{ type: string }>();
  const type = (TYPES.includes((params.type ?? '') as CollectionType) ? params.type : 'mastered') as CollectionType;
  const meta = META[type];

  const { data: allCards = [], isLoading, error, refetch } = useAllCards();
  const { refreshing, onRefresh } = usePullToRefresh(refetch);
  const savedIds = useBookmarkStore((s) => s.ids);
  const likedIds = useLikeStore((s) => s.ids);
  const reports = useReportStore((s) => s.reports);
  const history = useSrsStore((s) => s.history);

  // 검색어 · 카테고리 필터(chip) 상태.
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<string | null>(null);

  // 종류별 원본 카드 목록.
  const baseCards = useMemo<LearningCard[]>(() => {
    const byId = new Map(allCards.map((x) => [x.id, x]));
    if (type === 'today') {
      const ids = history[dateKey(new Date())] ?? [];
      // 최근 학습 순(뒤에 추가된 것이 최신)으로.
      return ids.map((id) => byId.get(id)).filter(Boolean).reverse() as LearningCard[];
    }
    if (type === 'saved') return savedIds.map((id) => byId.get(id)).filter(Boolean) as LearningCard[];
    if (type === 'liked') return likedIds.map((id) => byId.get(id)).filter(Boolean) as LearningCard[];
    if (type === 'reported') {
      const ids = Array.from(new Set(reports.map((r) => r.cardId)));
      return ids.map((id) => byId.get(id)).filter(Boolean) as LearningCard[];
    }
    return allCards.filter((x) => x.status === type);
  }, [type, allCards, savedIds, likedIds, reports, history]);

  // 필터 chip 후보 — 이 묶음에 실제 존재하는 카테고리들.
  const categories = useMemo(() => Array.from(new Set(baseCards.map((x) => x.category))), [baseCards]);

  // 검색어 + 카테고리 chip 을 적용한 최종 목록.
  const cards = useMemo(() => {
    const q = query.trim().toLowerCase();
    return baseCards.filter((card) => {
      if (cat && card.category !== cat) return false;
      if (!q) return true;
      return (
        card.question.toLowerCase().includes(q) ||
        card.category.toLowerCase().includes(q) ||
        (card.subCategory ?? '').toLowerCase().includes(q) ||
        (card.topic ?? '').toLowerCase().includes(q)
      );
    });
  }, [baseCards, query, cat]);

  // 카드별 '가장 최근' 신고 내역.
  const latestReportByCard = useMemo(() => {
    const map = new Map<string, CardReport>();
    for (const r of reports) if (!map.has(r.cardId)) map.set(r.cardId, r);
    return map;
  }, [reports]);

  const isEmptyBase = baseCards.length === 0;

  const openCard = useCallback((id: string) => router.push(ROUTES.content(id) as never), [router]);

  const renderRow = useCallback(
    ({ item }: { item: LearningCard }) => (
      <CardRow
        card={item}
        report={latestReportByCard.get(item.id)}
        showReport={type === 'reported'}
        onPress={openCard}
      />
    ),
    [latestReportByCard, type, openCard],
  );

  // 불러오지 못한 것과 '하나도 없는 것'은 다르다.
  // 구분하지 않으면 통신이 끊긴 사용자에게 "저장한 카드가 없어요"라고 말하게 되고,
  // 사용자는 자기 데이터가 사라진 줄 안다. 알림/딥링크로 이 화면부터 열면
  // 캐시가 비어 있어 실제로 일어나는 일이다.
  if (error && allCards.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <ScreenHeader title={meta.title} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ErrorState message="카드를 불러오지 못했어요" onRetry={refetch} />
        </View>
      </View>
    );
  }

  if (isLoading && allCards.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <ScreenHeader title={meta.title} />
        <CardListSkeleton />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title={`${meta.title}${baseCards.length ? ` (${baseCards.length})` : ''}`} />

      {/* 검색 + 필터 chip — 묶음 안에서 빠르게 찾기. 비어 있으면 숨긴다. */}
      {!isEmptyBase && (
        <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4, backgroundColor: c.bg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.surfaceAlt, borderRadius: 12, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, height: 42 }}>
            <Ionicons name="search" size={17} color={c.textSecondary} />
            <TextInput
              accessibilityLabel="카드 검색"
              value={query}
              onChangeText={setQuery}
              placeholder="카드 검색 (질문·분야)"
              placeholderTextColor={c.textSecondary}
              style={{ flex: 1, minWidth: 0, color: c.textPrimary, fontSize: 14 * fs, fontFamily: fontBody, paddingVertical: 0 }}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="검색어 지우기">
                <Ionicons name="close-circle" size={17} color={c.textSecondary} />
              </Pressable>
            )}
          </View>

          {categories.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 10, paddingBottom: 2 }}>
              {[null, ...categories].map((cc) => {
                const active = cat === cc;
                const color = cc ? (getCategoryColor(cc) ?? c.primary) : c.primary;
                return (
                  <Pressable accessibilityRole="button" key={cc ?? 'all'} onPress={() => setCat(cc)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1.5, backgroundColor: active ? color + '1A' : c.surface, borderColor: active ? color : c.border }}>
                    {cc && <Ionicons name={getCategoryIcon(cc)} size={13} color={active ? color : c.textSecondary} />}
                    <Text style={{ color: active ? color : c.textSecondary, fontSize: 12.5 * fs, fontFamily: fontDisplay }}>{cc ?? '전체'}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}

      {isEmptyBase ? (
        <Animated.View entering={FadeIn} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 90 }}>
          <View style={{ width: 78, height: 78, borderRadius: 39, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <Ionicons name={meta.icon} size={34} color={c.textSecondary} />
          </View>
          <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontFamily: fontDisplay }}>{meta.empty}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push(ROUTES.cards)} style={{ marginTop: 18, backgroundColor: c.primary, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10 }}>
            <Text style={{ color: c.textOnPrimary, fontSize: 13, fontFamily: fontDisplay }}>학습하러 가기</Text>
          </Pressable>
        </Animated.View>
      ) : (
        /* 큰 묶음도 가볍게 — FlatList 로 가상화해 보이는 만큼만 렌더한다. */
        <FlatList
          data={cards}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} colors={[c.primary]} />
          }
          keyboardShouldPersistTaps="handled"
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews
          contentContainerStyle={{ padding: 20, paddingTop: 12, flexGrow: 1 }}
          ListEmptyComponent={
            <Animated.View entering={FadeIn} style={{ alignItems: 'center', paddingVertical: 60 }}>
              <Ionicons name="search-outline" size={34} color={c.textSecondary} style={{ marginBottom: 10 }} />
              <Text style={{ color: c.textSecondary, fontSize: 14 * fs, fontFamily: fontBody }}>검색 결과가 없어요</Text>
            </Animated.View>
          }
          renderItem={renderRow}
        />
      )}
    </View>
  );
}

/**
 * 목록 한 줄.
 *
 * 별도 컴포넌트로 뺀 이유는 두 가지다.
 *  · 인라인 renderItem 은 화면이 리렌더될 때마다 새 함수가 되어 FlatList 가
 *    보이는 행을 전부 다시 그린다. 검색어를 한 글자 칠 때마다 그 일이 벌어진다.
 *  · memo 로 감싸면 스크롤 중 이미 그려진 행은 건너뛴다.
 */
const CardRow = React.memo(function CardRow({
  card,
  report,
  showReport,
  onPress,
}: {
  card: LearningCard;
  report?: CardReport;
  showReport: boolean;
  onPress: (id: string) => void;
}) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const accent = getCategoryColor(card.category) ?? c.primary;
  const diff = getDifficultyMeta(theme, card.difficulty);
  // 한 번만 구한다 — 예전에는 조건과 source 에서 각각 불러 행마다 두 번 돌았다.
  const image = resolveCardImage(card.imageUrl);

  return (
    <Pressable
      onPress={() => onPress(card.id)}
      accessibilityRole="button"
      accessibilityLabel={card.question}
      style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}
    >
      {image ? (
        <Image source={image} style={styles.thumb} contentFit="cover" transition={200} />
      ) : (
        <View style={[styles.thumb, { backgroundColor: accent + '18', alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons name={getCategoryIcon(card.category)} size={24} color={accent} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <CategoryTrail category={card.taxonomyCategory || card.category} subCategory={card.subCategory} topic={card.topic} size="sm" />
        <Text numberOfLines={2} style={{ color: c.textPrimary, fontSize: 13.5 * fs, lineHeight: 19, marginTop: 5, fontFamily: fontDisplay }}>{card.question}</Text>
        {showReport && report ? (
          <View style={{ marginTop: 8, backgroundColor: c.warning + '14', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="flag" size={11} color={c.warning} />
              <Text style={{ color: c.warning, fontSize: 11 * fs, fontFamily: fontDisplay }}>신고 사항 · {REPORT_REASON_LABEL[report.reason]}</Text>
            </View>
            {!!report.detail && (
              <Text numberOfLines={2} style={{ color: c.textSecondary, fontSize: 11.5 * fs, lineHeight: 16, marginTop: 3, fontFamily: fontBody }}>{report.detail}</Text>
            )}
          </View>
        ) : (
          <Text style={{ color: diff.color, fontSize: 11, marginTop: 6, fontFamily: fontDisplay }}>{diff.label}</Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color={c.textSecondary} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', borderRadius: 16, borderWidth: 1, padding: 12, marginBottom: 10 },
  thumb: { width: 56, height: 56, borderRadius: 12 },
});
