import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Badge } from '../../src/components/ui/Badge';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { QuestionImage } from '../../src/components/ui/QuestionImage';
import { CategoryTrail } from '../../src/components/ui/CategoryTrail';
import { resolveCardImage, hasCardImage } from '../../src/data/cardImages';
import { CardReportModal } from '../../src/components/cards/CardReportModal';
import { CardDifficultyPoll } from '../../src/components/cards/CardDifficultyPoll';
import { CardBackBody } from '../../src/components/cards/CardBackBody';
import { CardTips } from '../../src/components/community/CardTips';
import { fontCute } from '../../src/theme/tokens';
import { getCategoryIcon } from '../../src/constants/categories';
import { getDifficultyMeta } from '../../src/constants/difficulty';
import { useAllCards } from '../../src/hooks/useCards';
import { CardReactionBar } from '../../src/components/cards/CardReactionBar';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { errorMessage } from '../../src/data/network/errors';

const statusLabel: Record<string, string> = { new: '새 카드', learning: '학습 중', mastered: '마스터' };

export default function ContentDetailScreen() {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  const fs = fontScale;
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: allCards = [], isLoading, error, refetch } = useAllCards();
  const card = allCards.find((c) => c.id === id);
  const [reportOpen, setReportOpen] = useState(false);
  useEffect(() => { setReportOpen(false); }, [id]);

  if (!card) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <ScreenHeader title="컨텐츠 상세" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {error ? <ErrorState message={errorMessage(error)} onRetry={refetch} /> :
            <Text style={{ color: c.textSecondary, fontFamily: fontCute }}>{isLoading ? '카드를 불러오는 중이에요' : '카드를 찾을 수 없어요'}</Text>}
        </View>
      </View>
    );
  }

  const diff = getDifficultyMeta(theme, card.difficulty);

  // 카드(앞면=질문 / 뒷면=해설) 영역을 연한 색·그림자로 강조 — 학습 카드와 같은 톤.
  const isLight = theme.mode === 'light';
  const questionTint = c.primary + (isLight ? '10' : '18');
  const answerTint = c.success + (isLight ? '12' : '1C');
  const questionBorder = c.primary + (isLight ? '33' : '3A');
  const answerBorder = c.success + (isLight ? '33' : '3A');
  const cardShadow = isLight ? '0 8px 20px rgba(15,23,42,0.10)' : '0 8px 20px rgba(0,0,0,0.45)';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title="컨텐츠 상세" />

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Ionicons name={getCategoryIcon(card.category)} size={26} color={c.primary} />
          <Badge label={card.category} />
          <Text style={{ color: diff.color, fontSize: 12, fontWeight: '700', fontFamily: fontCute }}>{diff.label}</Text>
          <View style={{ backgroundColor: c.surfaceAlt, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ color: c.textSecondary, fontSize: 11, fontWeight: '600', fontFamily: fontCute }}>{statusLabel[card.status]}</Text>
          </View>
        </View>

        <View style={{ marginBottom: 14 }}>
          <CategoryTrail category={card.taxonomyCategory || card.category} subCategory={card.subCategory} topic={card.topic} />
        </View>

        {hasCardImage(card.imageUrl) ? (
          <Animated.View entering={FadeInDown.delay(60).duration(360)} style={{ marginBottom: 14 }}>
            <QuestionImage source={resolveCardImage(card.imageUrl)} height={248} alt={card.title} />
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeInDown.delay(120).duration(360)} style={{ backgroundColor: questionTint, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: questionBorder, marginBottom: 14, boxShadow: cardShadow }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 }}>
            <Ionicons name="help-circle" size={16} color={c.primary} />
            <Text style={{ color: c.primary, fontSize: 12, fontWeight: '700', fontFamily: fontCute }}>앞면 · 질문</Text>
          </View>
          {!!card.situation && (
            <Text style={{ color: c.textPrimary, fontSize: 17 * fs, fontWeight: '800', lineHeight: 25 * fs, fontFamily: fontCute, marginBottom: 10 }}>{card.situation}</Text>
          )}
          <Text style={{ color: c.primary, fontSize: 17 * fs, fontWeight: '800', lineHeight: 25 * fs, fontFamily: fontCute }}>
            <Text style={{ fontWeight: '900' }}>Q. </Text>{card.question}
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(180).duration(360)} style={{ backgroundColor: answerTint, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: answerBorder, marginBottom: 14, boxShadow: cardShadow }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 }}>
            <Ionicons name="school" size={16} color={c.success} />
            <Text style={{ color: c.success, fontSize: 12, fontWeight: '700', fontFamily: fontCute }}>뒷면 · 해설</Text>
          </View>
          <CardBackBody card={card} />
          <CardReactionBar cardId={card.id} onReport={() => setReportOpen(true)} />
        </Animated.View>

        {/* 해설 아래: 현장 팁 → 처음 선택한 답변 → 체감 난이도 (뒤 둘은 한 카드) */}
        <Animated.View entering={FadeInDown.delay(240).duration(360)}>
          <CardTips cardId={card.id} />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300).duration(360)}>
          <CardDifficultyPoll cardId={card.id} />
        </Animated.View>
      </ScrollView>

      <CardReportModal visible={reportOpen} card={card} onClose={() => setReportOpen(false)} />
    </View>
  );
}
