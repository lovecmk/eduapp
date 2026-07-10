import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useTheme } from '../src/theme/ThemeProvider';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { SearchBar } from '../src/components/ui/SearchBar';
import { SkeletonLoader } from '../src/components/ui/SkeletonLoader';
import { ErrorState } from '../src/components/ui/ErrorState';
import { CategoryTrail } from '../src/components/ui/CategoryTrail';
import { fontDisplay, fontBody, fontMono } from '../src/theme/tokens';
import { getCategoryIcon, getCategoryColor, ALL_CATEGORIES } from '../src/constants/categories';
import { getDifficultyMeta } from '../src/constants/difficulty';
import { ROUTES } from '../src/constants/routes';
import { useAllCards } from '../src/hooks/useCards';
import type { LearningCard, CardCategory, CardStatus, CardDifficulty } from '../src/domain/models/LearningCard';

const STATUS_META: Record<CardStatus, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  new: { label: '새 카드', color: '#94A3B8', icon: 'ellipse-outline' },
  learning: { label: '학습 중', color: '#2563EB', icon: 'time' },
  mastered: { label: '마스터', color: '#34C759', icon: 'checkmark-circle' },
};

const DIFF_FILTERS: { key: 'all' | CardDifficulty; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'easy', label: '초급' },
  { key: 'medium', label: '중급' },
  { key: 'hard', label: '고급' },
];

export default function ContentsScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const { data: allCards = [], isLoading, error, refetch } = useAllCards();
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState<CardCategory | null>(null);
  const [diff, setDiff] = useState<'all' | CardDifficulty>('all');

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // 대분류별 진행 집계
  const catStats = useMemo(() => {
    const m = new Map<CardCategory, { total: number; mastered: number }>();
    for (const card of allCards) {
      const prev = m.get(card.category) ?? { total: 0, mastered: 0 };
      prev.total += 1;
      if (card.status === 'mastered') prev.mastered += 1;
      m.set(card.category, prev);
    }
    return m;
  }, [allCards]);

  const filtered = useMemo(() => {
    let list = allCards;
    if (cat) list = list.filter((x) => x.category === cat);
    if (diff !== 'all') list = list.filter((x) => x.difficulty === diff);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((x) =>
        x.question.toLowerCase().includes(q) || x.answer.toLowerCase().includes(q) ||
        x.topic.toLowerCase().includes(q) || x.subCategory.toLowerCase().includes(q));
    }
    return list;
  }, [allCards, cat, diff, search]);

  if (isLoading && allCards.length === 0 && !error) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <ScreenHeader title="전체 컨텐츠" />
        <SkeletonLoader count={6} />
      </View>
    );
  }
  if (error && allCards.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <ScreenHeader title="전체 컨텐츠" />
        <ErrorState message="컨텐츠를 불러올 수 없어요" onRetry={refetch} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title="전체 컨텐츠" />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
        contentContainerStyle={{ paddingBottom: 36 }}
        showsVerticalScrollIndicator={false}
      >
        {/* 검색 */}
        <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
          <SearchBar value={search} onChange={setSearch} placeholder="주제·질문 검색..." />
        </View>

        {/* 대분류 개요(진행) */}
        <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>분야별 진행</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 10, paddingBottom: 4 }}>
          <CatCard label="전체" icon="grid" color={c.primary}
            total={allCards.length} mastered={allCards.filter((x) => x.status === 'mastered').length}
            active={cat === null} onPress={() => setCat(null)} />
          {ALL_CATEGORIES.map((k) => {
            const st = catStats.get(k) ?? { total: 0, mastered: 0 };
            return (
              <CatCard key={k} label={k} icon={getCategoryIcon(k)} color={getCategoryColor(k) ?? c.primary}
                total={st.total} mastered={st.mastered} active={cat === k} onPress={() => setCat(cat === k ? null : k)} />
            );
          })}
        </ScrollView>

        {/* 난이도 필터 */}
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 6 }}>
          {DIFF_FILTERS.map((d) => {
            const active = d.key === diff;
            return (
              <Pressable key={d.key} onPress={() => setDiff(d.key)}
                style={[styles.diffChip, { backgroundColor: active ? c.textPrimary : c.surfaceAlt, borderColor: active ? c.textPrimary : c.border }]}>
                <Text style={{ color: active ? c.bg : c.textSecondary, fontSize: 12 * fs, fontFamily: fontDisplay }}>{d.label}</Text>
              </Pressable>
            );
          })}
          <View style={{ flex: 1 }} />
          <Text style={{ color: c.textSecondary, fontSize: 12, fontFamily: fontMono, alignSelf: 'center' }}>{filtered.length}건</Text>
        </View>

        {/* 리스트 */}
        <View style={{ paddingHorizontal: 20, paddingTop: 6 }}>
          {filtered.length === 0 ? (
            <Animated.View entering={FadeIn} style={{ alignItems: 'center', paddingVertical: 70 }}>
              <Ionicons name="search-outline" size={40} color={c.textSecondary} />
              <Text style={{ color: c.textSecondary, fontSize: 14 * fs, marginTop: 10, fontFamily: fontBody }}>
                {search ? `"${search}" 검색 결과가 없어요` : '해당 조건의 컨텐츠가 없어요'}
              </Text>
            </Animated.View>
          ) : (
            filtered.map((card, i) => (
              <Animated.View key={card.id} entering={FadeInDown.delay(Math.min(i, 8) * 40).duration(320)}>
                <ContentRow card={card} onPress={() => router.push(ROUTES.content(card.id) as never)} />
              </Animated.View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function CatCard({ label, icon, color, total, mastered, active, onPress }: {
  label: string; icon: keyof typeof Ionicons.glyphMap; color: string; total: number; mastered: number; active: boolean; onPress: () => void;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;
  return (
    <Pressable onPress={onPress} style={[styles.catCard, { backgroundColor: c.surface, borderColor: active ? color : c.border, borderWidth: active ? 2 : 1 }]}>
      <View style={[styles.catIcon, { backgroundColor: color + '1A' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={{ color: c.textPrimary, fontSize: 13, fontFamily: fontDisplay, marginTop: 8 }}>{label}</Text>
      <Text style={{ color: c.textSecondary, fontSize: 11, fontFamily: fontMono, marginTop: 2 }}>{mastered}/{total}</Text>
      <View style={{ height: 4, backgroundColor: c.surfaceAlt, borderRadius: 2, overflow: 'hidden', marginTop: 8, width: '100%' }}>
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: 2 }} />
      </View>
    </Pressable>
  );
}

function ContentRow({ card, onPress }: { card: LearningCard; onPress: () => void }) {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const accent = getCategoryColor(card.category) ?? c.primary;
  const diff = getDifficultyMeta(theme, card.difficulty);
  const status = STATUS_META[card.status];
  return (
    <Pressable onPress={onPress} style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
      {card.imageUrl ? (
        <Image source={{ uri: card.imageUrl }} style={styles.thumb} contentFit="cover" transition={200} />
      ) : (
        <View style={[styles.thumb, { backgroundColor: accent + '18', alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons name={getCategoryIcon(card.category)} size={24} color={accent} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <CategoryTrail category={card.category} subCategory={card.subCategory} topic={card.topic} size="sm" />
        <Text numberOfLines={2} style={{ color: c.textPrimary, fontSize: 13.5 * fs, lineHeight: 19, marginTop: 5, fontFamily: fontDisplay }}>{card.question}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 7 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Ionicons name={status.icon} size={12} color={status.color} />
            <Text style={{ color: status.color, fontSize: 11, fontFamily: fontDisplay }}>{status.label}</Text>
          </View>
          <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: c.border }} />
          <Text style={{ color: diff.color, fontSize: 11, fontFamily: fontDisplay }}>{diff.label}</Text>
          {card.imageUrl ? (
            <>
              <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: c.border }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Ionicons name="image" size={11} color={c.textSecondary} />
                <Text style={{ color: c.textSecondary, fontSize: 10.5, fontFamily: fontBody }}>이미지</Text>
              </View>
            </>
          ) : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={c.textSecondary} style={{ alignSelf: 'center' }} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { fontSize: 12, fontFamily: fontDisplay, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 20, marginBottom: 10, marginLeft: 20 },
  catCard: { width: 108, borderRadius: 16, padding: 12 },
  catIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  diffChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', borderRadius: 16, borderWidth: 1, padding: 12, marginBottom: 10 },
  thumb: { width: 56, height: 56, borderRadius: 12 },
});
