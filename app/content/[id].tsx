import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
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
import { fontCute, fontBody } from '../../src/theme/tokens';
import { getCategoryIcon } from '../../src/constants/categories';
import { getDifficultyMeta } from '../../src/constants/difficulty';
import { useAllCards } from '../../src/hooks/useCards';
import { CardReactionBar } from '../../src/components/cards/CardReactionBar';
import { firstDecision, useSrsStore } from '../../src/store/srsStore';
import { hapticSuccess, hapticTap } from '../../src/utils/haptics';
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
  const [reviewMark, setReviewMark] = useState<'mastered' | 'learning' | null>(null);
  const srsState = useSrsStore(s => s.cards[id ?? '']);
  const first = firstDecision(srsState);
  const firstLabel = first ? (first.grade === 'again' || first.grade === 'hard' ? '다음에 한번 더 볼게요' : '이해했어요') : null;
  const srsGrade = useSrsStore((s) => s.grade);

  useEffect(() => { setReviewMark(null); setReportOpen(false); }, [id]);

  // 복습 상세에서 '이해했어요 / 다음에 한번 더' — 학습 모드로 전환하지 않고 자기평가만 기록한다.
  // (마스터/학습 상태 갱신 + 간격반복 일정 반영으로 다음 복습 시점과 달력에 반영된다.)
  const handleReviewMark = (status: 'mastered' | 'learning') => {
    if (!card || reviewMark) return;
    if (status === 'mastered') hapticSuccess(); else hapticTap();
    srsGrade(card.id, status === 'mastered' ? 'good' : 'again');
    setReviewMark(status);
  };

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
          <CategoryTrail category={card.category} subCategory={card.subCategory} topic={card.topic} />
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

        <View style={{ marginBottom: 16, padding: 14, borderRadius: 16, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border }}>
          <Text testID="first-review-choice" style={{ color: c.textSecondary, fontSize: 12 * fs, lineHeight: 19 * fs, fontFamily: fontBody, marginBottom: 10 }}>
            {firstLabel ? `처음엔 '${firstLabel}'를 선택했어요.` : '이 카드의 최초 선택 기록을 확인할 수 없어요.'}
          </Text>
          {reviewMark ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52, paddingVertical: 10 }}>
              <Ionicons name={reviewMark === 'mastered' ? 'checkmark-circle' : 'refresh-circle'} size={20} color={reviewMark === 'mastered' ? c.success : c.warning} />
              <Text style={{ color: reviewMark === 'mastered' ? c.success : c.warning, fontSize: 15 * fs, fontWeight: '700', fontFamily: fontCute, flex: 1, textAlign: 'center', lineHeight: 22 * fs }}>
                {reviewMark === 'mastered' ? '이번 복습: 이해했어요' : '이번 복습: 다음에 한번 더 볼게요'}
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable accessibilityRole="button" onPress={() => handleReviewMark('learning')}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.warning, borderRadius: 14, minHeight: 52, paddingVertical: 10, boxShadow: `0 3px 8px ${c.warning}3D` }}>
                <Ionicons name="refresh-circle" size={19} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 14.5 * fs, fontWeight: '700', fontFamily: fontCute, flex: 1, textAlign: 'center' }}>다음에 한번 더 볼게요</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => handleReviewMark('mastered')}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.success, borderRadius: 14, minHeight: 52, paddingVertical: 10, boxShadow: `0 3px 8px ${c.success}3D` }}>
                <Ionicons name="checkmark-circle" size={19} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 14.5 * fs, fontWeight: '700', fontFamily: fontCute, flex: 1, textAlign: 'center' }}>이해했어요</Text>
              </Pressable>
            </View>
          )}
        </View>

        <CardDifficultyPoll cardId={card.id} />

        <CardTips cardId={card.id} />
      </ScrollView>

      <CardReportModal visible={reportOpen} card={card} onClose={() => setReportOpen(false)} />
    </View>
  );
}
