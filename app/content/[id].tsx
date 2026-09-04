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
import { useAllCards, useMarkCard } from '../../src/hooks/useCards';
import { useReportStore } from '../../src/store/reportStore';
import { useBookmarkStore } from '../../src/store/bookmarkStore';
import { useSrsStore } from '../../src/store/srsStore';
import { hapticSuccess, hapticTap } from '../../src/utils/haptics';

const statusLabel: Record<string, string> = { new: '새 카드', learning: '학습 중', mastered: '마스터' };

export default function ContentDetailScreen() {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  const fs = fontScale;
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: allCards = [], refetch } = useAllCards();
  const card = allCards.find((c) => c.id === id);
  const [reportOpen, setReportOpen] = useState(false);
  const [reviewMark, setReviewMark] = useState<'mastered' | 'learning' | null>(null);
  const reported = useReportStore((s) => s.hasReported(id ?? ''));
  const bookmarked = useBookmarkStore((s) => s.ids.includes(id ?? ''));
  const toggleBookmark = useBookmarkStore((s) => s.toggle);
  const markCardMutation = useMarkCard();
  const srsGrade = useSrsStore((s) => s.grade);

  useEffect(() => { if (!card) refetch(); }, [card, refetch]);

  // 복습 상세에서 '이해했어요 / 다음에 한번 더' — 학습 모드로 전환하지 않고 자기평가만 기록한다.
  // (마스터/학습 상태 갱신 + 간격반복 일정 반영으로 다음 복습 시점과 달력에 반영된다.)
  const handleReviewMark = (status: 'mastered' | 'learning') => {
    if (!card) return;
    if (status === 'mastered') hapticSuccess(); else hapticTap();
    markCardMutation.mutate({ id: card.id, status });
    srsGrade(card.id, status === 'mastered' ? 'good' : 'again');
    setReviewMark(status);
  };

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

  // 카드(앞면=질문 / 뒷면=해설) 영역을 연한 색·그림자로 강조 — 학습 카드와 같은 톤.
  const isLight = theme.mode === 'light';
  const questionTint = c.primary + (isLight ? '10' : '18');
  const answerTint = c.success + (isLight ? '12' : '1C');
  const questionBorder = c.primary + (isLight ? '33' : '3A');
  const answerBorder = c.success + (isLight ? '33' : '3A');
  const cardShadow = isLight ? '0 8px 20px rgba(15,23,42,0.10)' : '0 8px 20px rgba(0,0,0,0.45)';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader
        title="컨텐츠 상세"
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Pressable
              onPress={() => toggleBookmark(card.id)}
              hitSlop={8}
              style={{ padding: 6 }}
              accessibilityRole="button"
              accessibilityLabel={bookmarked ? '저장 해제' : '이 카드 저장'}
            >
              <Ionicons name={bookmarked ? 'bookmark' : 'bookmark-outline'} size={19} color={bookmarked ? c.primary : c.textSecondary} />
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setReportOpen(true)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 8 }}>
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
            <Text style={{ color: c.textPrimary, fontSize: 13.5 * fs, lineHeight: 21 * fs, fontFamily: fontBody, marginBottom: 10 }}>{card.situation}</Text>
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
        </Animated.View>

        <CardDifficultyPoll cardId={card.id} />

        <CardTips cardId={card.id} />
      </ScrollView>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 32, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border }}>
        {reviewMark ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52 }}>
            <Ionicons name={reviewMark === 'mastered' ? 'checkmark-circle' : 'refresh-circle'} size={20} color={reviewMark === 'mastered' ? c.success : c.warning} />
            <Text style={{ color: reviewMark === 'mastered' ? c.success : c.warning, fontSize: 15 * fs, fontWeight: '700', fontFamily: fontCute }}>
              {reviewMark === 'mastered' ? '이해 완료로 기록했어요' : '다음 복습에 다시 보여드릴게요'}
            </Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable accessibilityRole="button" onPress={() => handleReviewMark('learning')}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.warning, borderRadius: 14, height: 52, boxShadow: `0 3px 8px ${c.warning}3D` }}>
              <Ionicons name="refresh-circle" size={19} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 14.5 * fs, fontWeight: '700', fontFamily: fontCute }}>다음에 한번 더 볼게요</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => handleReviewMark('mastered')}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.success, borderRadius: 14, height: 52, boxShadow: `0 3px 8px ${c.success}3D` }}>
              <Ionicons name="checkmark-circle" size={19} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 14.5 * fs, fontWeight: '700', fontFamily: fontCute }}>이해했어요</Text>
            </Pressable>
          </View>
        )}
      </View>

      <CardReportModal visible={reportOpen} card={card} onClose={() => setReportOpen(false)} />
    </View>
  );
}
