import React, { useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { resolveCardImage } from '../src/data/cardImages';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useTheme } from '../src/theme/ThemeProvider';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { CategoryTrail } from '../src/components/ui/CategoryTrail';
import { fontDisplay, fontBody } from '../src/theme/tokens';
import { getCategoryIcon, getCategoryColor } from '../src/constants/categories';
import { getDifficultyMeta } from '../src/constants/difficulty';
import { ROUTES } from '../src/constants/routes';
import { useAllCards } from '../src/hooks/useCards';
import { useBookmarkStore } from '../src/store/bookmarkStore';
import { contentColumn } from '../src/theme/layout';

export default function SavedScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const { data: allCards = [] } = useAllCards();
  const ids = useBookmarkStore((s) => s.ids);
  const toggle = useBookmarkStore((s) => s.toggle);

  // 저장 순서 유지(ids 순).
  const saved = useMemo(() => {
    const byId = new Map(allCards.map((x) => [x.id, x]));
    return ids.map((id) => byId.get(id)).filter(Boolean) as typeof allCards;
  }, [ids, allCards]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title={`저장한 카드${saved.length ? ` (${saved.length})` : ''}`} />
      <ScrollView contentContainerStyle={{ padding: 20, flexGrow: 1, ...contentColumn }} showsVerticalScrollIndicator={false}>
        {saved.length === 0 ? (
          <Animated.View entering={FadeIn} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 90 }}>
            <View style={{ width: 78, height: 78, borderRadius: 39, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <Ionicons name="bookmark-outline" size={34} color={c.textSecondary} />
            </View>
            <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontFamily: fontDisplay }}>저장한 카드가 없어요</Text>
            <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, marginTop: 6, textAlign: 'center', lineHeight: 19, fontFamily: fontBody }}>
              카드 상세에서 북마크를 눌러{'\n'}나중에 볼 카드를 저장해보세요
            </Text>
            <Pressable accessibilityRole="button" onPress={() => router.push(ROUTES.contents)} style={{ marginTop: 18, backgroundColor: c.primary, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10 }}>
              <Text style={{ color: c.textOnPrimary, fontSize: 13, fontFamily: fontDisplay }}>학습 목표 둘러보기</Text>
            </Pressable>
          </Animated.View>
        ) : (
          saved.map((card, i) => {
            const accent = getCategoryColor(card.category) ?? c.primary;
            const diff = getDifficultyMeta(theme, card.difficulty);
            return (
              <Animated.View key={card.id} entering={FadeInDown.delay(Math.min(i, 8) * 35).duration(300)}>
                {/* 항목 본문과 '저장 해제'는 **형제**여야 한다. 예전엔 해제 버튼이 본문
                    Pressable 안에 들어 있었는데, 웹(react-native-web)에서는 둘 다 <button>
                    으로 렌더되어 버튼 안에 버튼이 생긴다 — 유효하지 않은 DOM 이고, 스크린
                    리더는 중첩된 컨트롤을 제대로 읽어 주지 못한다. */}
                <View style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
                  <Pressable accessibilityRole="button" onPress={() => router.push(ROUTES.content(card.id) as never)} style={styles.rowMain}>
                    {resolveCardImage(card.imageUrl) ? (
                      <Image source={resolveCardImage(card.imageUrl)!} style={styles.thumb} contentFit="cover" transition={200} />
                    ) : (
                      <View style={[styles.thumb, { backgroundColor: accent + '18', alignItems: 'center', justifyContent: 'center' }]}>
                        <Ionicons name={getCategoryIcon(card.category)} size={24} color={accent} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <CategoryTrail category={card.taxonomyCategory || card.category} subCategory={card.subCategory} topic={card.topic} size="sm" />
                      <Text numberOfLines={2} style={{ color: c.textPrimary, fontSize: 13.5 * fs, lineHeight: 19, marginTop: 5, fontFamily: fontDisplay }}>{card.question}</Text>
                      <Text style={{ color: diff.color, fontSize: 11, marginTop: 6, fontFamily: fontDisplay }}>{diff.label}</Text>
                    </View>
                  </Pressable>
                  <Pressable onPress={() => toggle(card.id)} hitSlop={8} style={{ padding: 4 }} accessibilityRole="button" accessibilityLabel="저장 해제">
                    <Ionicons name="bookmark" size={20} color={c.primary} />
                  </Pressable>
                </View>
              </Animated.View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', borderRadius: 16, borderWidth: 1, padding: 12, marginBottom: 10 },
  /** 항목 본문(썸네일+글) — 바깥 카드가 아니라 이쪽이 '내용 열기' 버튼이다. */
  rowMain: { flex: 1, flexDirection: 'row', gap: 12, alignItems: 'center' },
  thumb: { width: 56, height: 56, borderRadius: 12 },
});
