import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Badge } from '../../src/components/ui/Badge';
import { Button } from '../../src/components/ui/Button';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { QuestionImage } from '../../src/components/ui/QuestionImage';
import { CategoryTrail } from '../../src/components/ui/CategoryTrail';
import { resolveCardImage } from '../../src/data/cardImages';
import { CardReportModal } from '../../src/components/cards/CardReportModal';
import { CardDifficultyPoll } from '../../src/components/cards/CardDifficultyPoll';
import { CardBackBody } from '../../src/components/cards/CardBackBody';
import { CardTips } from '../../src/components/community/CardTips';
import { fontCute, fontBody } from '../../src/theme/tokens';
import { getCategoryIcon } from '../../src/constants/categories';
import { getDifficultyMeta } from '../../src/constants/difficulty';
import { ROUTES } from '../../src/constants/routes';
import { useAllCards } from '../../src/hooks/useCards';
import { useReportStore } from '../../src/store/reportStore';
import { useBookmarkStore } from '../../src/store/bookmarkStore';

const statusLabel: Record<string, string> = { new: '새 카드', learning: '학습 중', mastered: '마스터' };

export default function ContentDetailScreen() {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  const fs = fontScale;
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: allCards = [], refetch } = useAllCards();
  const card = allCards.find((c) => c.id === id);
  const [reportOpen, setReportOpen] = useState(false);
  const reported = useReportStore((s) => s.hasReported(id ?? ''));
  const bookmarked = useBookmarkStore((s) => s.ids.includes(id ?? ''));
  const toggleBookmark = useBookmarkStore((s) => s.toggle);

  useEffect(() => { if (!card) refetch(); }, [card, refetch]);

  if (!card) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <ScreenHeader title="컨텐츠 상세" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: c.textSecondary, fontFamily: fontCute }}>카드를 찾을 수 없어요</Text>
        </View>
      </View>
    );
  }

  const diff = getDifficultyMeta(theme, card.difficulty);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader
        title="컨텐츠 상세"
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Pressable onPress={() => toggleBookmark(card.id)} hitSlop={8} style={{ padding: 6 }}>
              <Ionicons name={bookmarked ? 'bookmark' : 'bookmark-outline'} size={19} color={bookmarked ? c.primary : c.textSecondary} />
            </Pressable>
            <Pressable onPress={() => setReportOpen(true)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 8 }}>
              <Ionicons name={reported ? 'flag' : 'flag-outline'} size={16} color={reported ? c.warning : c.textSecondary} />
              <Text style={{ color: reported ? c.warning : c.textSecondary, fontSize: 12, fontFamily: fontBody }}>{reported ? '요청됨' : '수정'}</Text>
            </Pressable>
          </View>
        }
      />

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Ionicons name={getCategoryIcon(card.category)} size={26} color={c.primary} />
          <Badge label={card.category} />
          <Text style={{ color: diff.color, fontSize: 12, fontWeight: '700', fontFamily: fontCute }}>{diff.label}</Text>
          <View style={{ backgroundColor: c.surfaceAlt, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ color: c.textSecondary, fontSize: 11, fontWeight: '600', fontFamily: fontCute }}>{statusLabel[card.status]}</Text>
          </View>
        </View>

        <View style={{ marginBottom: 14 }}>
          <CategoryTrail category={card.category} subCategory={card.subCategory} topic={card.topic} />
        </View>

        {resolveCardImage(card.imageUrl) ? (
          <Animated.View entering={FadeInDown.delay(60).duration(360)} style={{ marginBottom: 14 }}>
            <QuestionImage source={resolveCardImage(card.imageUrl)} height={200} />
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeInDown.delay(120).duration(360)} style={{ backgroundColor: c.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: c.border, marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
            <Ionicons name="help-circle" size={16} color={c.primary} />
            <Text style={{ color: c.primary, fontSize: 12, fontWeight: '700', fontFamily: fontCute }}>질문</Text>
          </View>
          {!!card.situation && (
            <Text style={{ color: c.textSecondary, fontSize: 13.5 * fs, lineHeight: 21, fontFamily: fontBody, marginBottom: 10 }}>{card.situation}</Text>
          )}
          <Text style={{ color: c.textPrimary, fontSize: 17 * fs, fontWeight: '800', lineHeight: 25, fontFamily: fontCute }}>{card.question}</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(180).duration(360)} style={{ backgroundColor: c.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: c.border, marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 }}>
            <Ionicons name="school" size={16} color={c.success} />
            <Text style={{ color: c.success, fontSize: 12, fontWeight: '700', fontFamily: fontCute }}>해설</Text>
          </View>
          <CardBackBody card={card} />
        </Animated.View>

        <CardDifficultyPoll cardId={card.id} />

        <CardTips cardId={card.id} />
      </ScrollView>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 32, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border }}>
        <Button label="이 카드 학습하기" variant="filled" onPress={() => router.push(ROUTES.cards)} />
      </View>

      <CardReportModal visible={reportOpen} card={card} onClose={() => setReportOpen(false)} />
    </View>
  );
}
