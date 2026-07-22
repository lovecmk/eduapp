import React, { useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { resolveCardImage } from '../../src/data/cardImages';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useTheme } from '../../src/theme/ThemeProvider';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { CategoryTrail } from '../../src/components/ui/CategoryTrail';
import { fontDisplay, fontBody } from '../../src/theme/tokens';
import { getCategoryIcon, getCategoryColor } from '../../src/constants/categories';
import { getDifficultyMeta } from '../../src/constants/difficulty';
import { ROUTES } from '../../src/constants/routes';
import { useAllCards } from '../../src/hooks/useCards';
import { useBookmarkStore } from '../../src/store/bookmarkStore';
import { useReportStore, REPORT_REASON_LABEL, type CardReport } from '../../src/store/reportStore';
import type { LearningCard } from '../../src/domain/models/LearningCard';

type CollectionType = 'mastered' | 'learning' | 'saved' | 'reported';

const META: Record<CollectionType, { title: string; icon: keyof typeof Ionicons.glyphMap; empty: string }> = {
  mastered: { title: '학습 완료 카드', icon: 'checkmark-done', empty: '아직 학습 완료한 카드가 없어요' },
  learning: { title: '한번 더 학습 카드', icon: 'refresh', empty: '다시 볼 카드가 없어요' },
  saved: { title: '저장한 카드', icon: 'bookmark', empty: '저장한 카드가 없어요' },
  reported: { title: '신고한 카드', icon: 'flag', empty: '신고한 카드가 없어요' },
};

export default function CollectionScreen() {
  const { theme, fontScale: fs } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const params = useLocalSearchParams<{ type: string }>();
  const type = (['mastered', 'learning', 'saved', 'reported'].includes(params.type ?? '') ? params.type : 'mastered') as CollectionType;
  const meta = META[type];

  const { data: allCards = [] } = useAllCards();
  const savedIds = useBookmarkStore((s) => s.ids);
  const reports = useReportStore((s) => s.reports);

  const cards = useMemo<LearningCard[]>(() => {
    const byId = new Map(allCards.map((x) => [x.id, x]));
    if (type === 'saved') return savedIds.map((id) => byId.get(id)).filter(Boolean) as LearningCard[];
    if (type === 'reported') {
      const ids = Array.from(new Set(reports.map((r) => r.cardId)));
      return ids.map((id) => byId.get(id)).filter(Boolean) as LearningCard[];
    }
    return allCards.filter((x) => x.status === type);
  }, [type, allCards, savedIds, reports]);

  // 카드별 '가장 최근' 신고 내역 — 신고한 카드 목록에서 어떤 사유로 신고했는지 함께 보여준다.
  const latestReportByCard = useMemo(() => {
    const map = new Map<string, CardReport>();
    // reports 는 최신순으로 prepend 되므로, 아직 없을 때만 담으면 카드별 최신 1건이 남는다.
    for (const r of reports) if (!map.has(r.cardId)) map.set(r.cardId, r);
    return map;
  }, [reports]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title={`${meta.title}${cards.length ? ` (${cards.length})` : ''}`} />
      <ScrollView contentContainerStyle={{ padding: 20, flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        {cards.length === 0 ? (
          <Animated.View entering={FadeIn} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 90 }}>
            <View style={{ width: 78, height: 78, borderRadius: 39, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <Ionicons name={meta.icon} size={34} color={c.textSecondary} />
            </View>
            <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontFamily: fontDisplay }}>{meta.empty}</Text>
            <Pressable onPress={() => router.push(ROUTES.cards)} style={{ marginTop: 18, backgroundColor: c.primary, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10 }}>
              <Text style={{ color: c.textOnPrimary, fontSize: 13, fontFamily: fontDisplay }}>학습하러 가기</Text>
            </Pressable>
          </Animated.View>
        ) : (
          cards.map((card, i) => {
            const accent = getCategoryColor(card.category) ?? c.primary;
            const diff = getDifficultyMeta(theme, card.difficulty);
            const report = latestReportByCard.get(card.id);
            return (
              <Animated.View key={card.id} entering={FadeInDown.delay(Math.min(i, 8) * 35).duration(300)}>
                <Pressable onPress={() => router.push(ROUTES.content(card.id) as never)} style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
                  {resolveCardImage(card.imageUrl) ? (
                    <Image source={resolveCardImage(card.imageUrl)!} style={styles.thumb} contentFit="cover" transition={200} />
                  ) : (
                    <View style={[styles.thumb, { backgroundColor: accent + '18', alignItems: 'center', justifyContent: 'center' }]}>
                      <Ionicons name={getCategoryIcon(card.category)} size={24} color={accent} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <CategoryTrail category={card.category} subCategory={card.subCategory} topic={card.topic} size="sm" />
                    <Text numberOfLines={2} style={{ color: c.textPrimary, fontSize: 13.5 * fs, lineHeight: 19, marginTop: 5, fontFamily: fontDisplay }}>{card.question}</Text>
                    {type === 'reported' && report ? (
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
  thumb: { width: 56, height: 56, borderRadius: 12 },
});
