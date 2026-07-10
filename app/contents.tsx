import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/ThemeProvider';
import { useCardStore } from '../src/store/cardStore';
import { Badge } from '../src/components/ui/Badge';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { SearchBar } from '../src/components/ui/SearchBar';
import { SkeletonLoader } from '../src/components/ui/SkeletonLoader';
import { ErrorState } from '../src/components/ui/ErrorState';
import { fontCute } from '../src/theme/tokens';
import { getCategoryIcon } from '../src/constants/categories';
import { getDifficultyMeta } from '../src/constants/difficulty';
import { ROUTES } from '../src/constants/routes';

const ALL_CATEGORIES = '전체';

export default function ContentsScreen() {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  const fs = fontScale;
  const router = useRouter();
  const { entities, allIds, fetchAll, loading, error } = useCardStore();
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState(ALL_CATEGORIES);

  const allCards = allIds.map((id) => entities[id]).filter(Boolean);

  useEffect(() => { fetchAll(); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, []);

  const categories = useMemo(() => {
    const cats = [...new Set(allCards.map((c) => c.category))];
    return [ALL_CATEGORIES, ...cats.sort()];
  }, [allCards]);

  const filtered = useMemo(() => {
    let list = allCards;
    if (selectedCat !== ALL_CATEGORIES) list = list.filter((c) => c.category === selectedCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        c.question.toLowerCase().includes(q) || c.answer.toLowerCase().includes(q) || c.explanation.toLowerCase().includes(q)
      );
    }
    return list;
  }, [allCards, selectedCat, search]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title={`전체 컨텐츠 (${allCards.length})`} />

      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 }}>
        <SearchBar value={search} onChange={setSearch} placeholder="카드 검색..." />
      </View>

      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={{ maxHeight: 40, marginBottom: 4 }}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
      >
        {categories.map((cat) => {
          const active = cat === selectedCat;
          return (
            <Pressable key={cat} onPress={() => setSelectedCat(cat)}
              style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999, backgroundColor: active ? c.primary : c.surfaceAlt, borderWidth: 1, borderColor: active ? c.primary : c.border }}>
              <Text style={{ color: active ? c.textOnPrimary : c.textSecondary, fontSize: 12 * fs, fontWeight: '700', fontFamily: fontCute }}>{cat}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
        contentContainerStyle={{ padding: 20, paddingTop: 8 }}
      >
        {loading && allCards.length === 0 && !error ? (
          <SkeletonLoader count={5} />
        ) : error && allCards.length === 0 ? (
          <ErrorState message="컨텐츠를 불러올 수 없어요" onRetry={fetchAll} />
        ) : filtered.length === 0 ? (
          <ErrorState message={search ? `"${search}" 검색 결과가 없어요` : '해당 카테고리에 컨텐츠가 없어요'} emoji="🔍" />
        ) : (
          filtered.map((card) => {
            const diff = getDifficultyMeta(theme, card.difficulty);
            return (
              <Pressable key={card.id} onPress={() => router.push(ROUTES.content(card.id) as any)}
                style={{ backgroundColor: c.surfaceAlt, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: c.border, flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name={getCategoryIcon(card.category)} size={24} color={c.primary} style={{ marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                    <Badge label={card.category} />
                    <Text style={{ color: diff.color, fontSize: 11, fontWeight: '700', fontFamily: fontCute }}>{diff.label}</Text>
                  </View>
                    <Text style={{ color: c.textPrimary, fontSize: 13 * fs, fontWeight: '600', lineHeight: 18 }}>{card.question}</Text>
                    <Text style={{ color: c.textSecondary, fontSize: 11, marginTop: 4 }} numberOfLines={1}>{card.answer}</Text>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
