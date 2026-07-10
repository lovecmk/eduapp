import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/ThemeProvider';
import { Badge } from '../src/components/ui/Badge';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { SearchBar } from '../src/components/ui/SearchBar';
import { SkeletonLoader } from '../src/components/ui/SkeletonLoader';
import { ErrorState } from '../src/components/ui/ErrorState';
import { fontCute } from '../src/theme/tokens';
import { getCategoryIcon } from '../src/constants/categories';
import { getDifficultyMeta } from '../src/constants/difficulty';
import { ROUTES } from '../src/constants/routes';
import { useAllCards } from '../src/hooks/useCards';

const ALL_CATEGORIES = '전체';

function CardItem({ card, onPress }: { card: any; onPress: () => void }) {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  const fs = fontScale;
  const diff = getDifficultyMeta(theme, card.difficulty);
  return (
    <Pressable onPress={onPress}
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
}

export default function ContentsScreen() {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  const fs = fontScale;
  const router = useRouter();
  const { data: allCards = [], isLoading, error, refetch } = useAllCards();
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState(ALL_CATEGORIES);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

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

  const renderItem = useCallback(({ item }: { item: any }) => (
    <CardItem card={item} onPress={() => router.push(ROUTES.content(item.id) as any)} />
  ), [router]);

  const keyExtractor = useCallback((item: any) => item.id, []);

  const emptyText = search ? `"${search}" 검색 결과가 없어요` : '해당 카테고리에 컨텐츠가 없어요';

  if (isLoading && allCards.length === 0 && !error) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <ScreenHeader title="전체 컨텐츠" />
        <SkeletonLoader count={5} />
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
      <ScreenHeader title={`전체 컨텐츠 (${allCards.length})`} />
      <FlatList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
        contentContainerStyle={{ padding: 20, paddingBottom: 32, flexGrow: 1 }}
        ListEmptyComponent={
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 }}>
            <Text style={{ fontSize: 36, marginBottom: 8 }}>🔍</Text>
            <Text style={{ color: c.textSecondary, fontSize: 14 * fs, fontFamily: fontCute }}>{emptyText}</Text>
          </View>
        }
        ListHeaderComponent={
          <>
            <View style={{ paddingBottom: 12 }}>
              <SearchBar value={search} onChange={setSearch} placeholder="카드 검색..." />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 12, flexWrap: 'wrap' }}>
              {categories.map((cat) => {
                const active = cat === selectedCat;
                return (
                  <Pressable key={cat} onPress={() => setSelectedCat(cat)}
                    style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999, backgroundColor: active ? c.primary : c.surfaceAlt, borderWidth: 1, borderColor: active ? c.primary : c.border }}>
                    <Text style={{ color: active ? c.textOnPrimary : c.textSecondary, fontSize: 12 * fs, fontWeight: '700', fontFamily: fontCute }}>{cat}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        }
      />
    </View>
  );
}
