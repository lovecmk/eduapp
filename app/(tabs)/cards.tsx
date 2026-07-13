import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useSettingsStore } from '../../src/store/settingsStore';
import { Button } from '../../src/components/ui/Button';
import { Badge } from '../../src/components/ui/Badge';
import { SkeletonLoader } from '../../src/components/ui/SkeletonLoader';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { QuestionImage } from '../../src/components/ui/QuestionImage';
import { CategoryTrail } from '../../src/components/ui/CategoryTrail';
import { CardTimer } from '../../src/components/cards/CardTimer';
import { CardBackBody } from '../../src/components/cards/CardBackBody';
import { fontCute } from '../../src/theme/tokens';
import { getCategoryIcon } from '../../src/constants/categories';
import { ROUTES } from '../../src/constants/routes';
import { useAllCards, useMarkCard } from '../../src/hooks/useCards';
import { useCardSwipe } from '../../src/hooks/useCardSwipe';

export default function CardsScreen() {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  const fs = fontScale;
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;

  const { data: allCards = [], isLoading, error, refetch } = useAllCards();
  const markCardMutation = useMarkCard();

  const card = allCards[index];

  const handleSwipeComplete = useCallback((dir: 'left' | 'right') => {
    if (!card) return;
    markCardMutation.mutate({ id: card.id, status: dir === 'right' ? 'mastered' : 'learning' });
    setDoneCount((n) => n + 1);
    setFlipped(false);
    const nextIdx = index + 1;
    if (nextIdx >= allCards.length) {
      setFinished(true);
    } else {
      setIndex(nextIdx);
    }
  }, [card, index, allCards.length, markCardMutation]);

  const { panResponder, translateX, cardOpacity, rotation, exiting, fireHaptic, completeSwipe } =
    useCardSwipe(handleSwipeComplete);

  const keepScreenOn = useSettingsStore((s) => s.keepScreenOn);
  const toggleKeepScreenOn = useSettingsStore((s) => s.toggleKeepScreenOn);

  useEffect(() => {
    if (!finished) return;
    Animated.timing(progressAnim, { toValue: 1, duration: 2000, useNativeDriver: false }).start(({ finished: ok }) => {
      if (ok) router.replace(ROUTES.stats as any);
    });
  }, [finished]);

  const restart = () => {
    setIndex(0);
    setDoneCount(0);
    setFlipped(false);
    setFinished(false);
    progressAnim.setValue(0);
  };

  if (isLoading && allCards.length === 0 && !error) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <SkeletonLoader count={3} />
      </View>
    );
  }

  if (error && allCards.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <ErrorState message="학습 카드를 불러올 수 없어요" onRetry={refetch} />
      </View>
    );
  }

  if (!card || finished) {
    const barWidth = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 52, marginBottom: 12 }}>🎉</Text>
        <Text style={{ color: c.textPrimary, fontSize: 22 * fs, fontWeight: '800', fontFamily: fontCute }}>학습 완료!</Text>
        <Text style={{ color: c.textSecondary, marginTop: 6, marginBottom: 28, fontFamily: fontCute }}>{doneCount}개 카드 학습 완료</Text>
        <View style={{ width: '60%', height: 4, backgroundColor: c.surfaceAlt, borderRadius: 2, overflow: 'hidden', marginBottom: 24 }}>
          <Animated.View style={{ width: barWidth, height: '100%', backgroundColor: c.primary, borderRadius: 2 }} />
        </View>
        <Text style={{ color: c.textSecondary, fontSize: 12 * fs, fontFamily: fontCute }}>통계 화면으로 이동 중...</Text>
        <View style={{ marginTop: 20 }}>
          <Button label="다시 학습하기" variant="outline" onPress={restart} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {keepScreenOn && (
        <Pressable onPress={toggleKeepScreenOn} style={{ position: 'absolute', top: 10, right: 20, zIndex: 20, padding: 4 }}>
          <Ionicons name="lock-closed" size={16} color={c.textSecondary} />
        </Pressable>
      )}

      <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="school-outline" size={16} color={c.primary} />
            <Text style={{ color: c.textPrimary, fontSize: 14 * fs, fontFamily: fontCute }}>학습 세션</Text>
          </View>
          <Text style={{ color: c.textSecondary, fontSize: 12, fontFamily: 'monospace' }}>{index + 1} / {allCards.length}</Text>
        </View>
        <View style={{ height: 6, backgroundColor: c.surfaceAlt, borderRadius: 3, overflow: 'hidden' }}>
          <View style={{ width: `${Math.round((index / Math.max(allCards.length, 1)) * 100)}%`, height: '100%', backgroundColor: c.primary, borderRadius: 3 }} />
        </View>
      </View>

      <Animated.View style={{ flex: 1, padding: 20, paddingBottom: 8 }} {...panResponder.panHandlers}>
        <Animated.View
          style={{
            flex: 1, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
            borderRadius: 20, padding: 24,
            transform: [{ translateX }, { rotate: rotation }], opacity: cardOpacity,
            boxShadow: '0 4px 16px rgba(0,0,0,0.06)', elevation: 4,
          }}
        >
          <Pressable onPress={() => { if (exiting) return; setFlipped((f) => !f); }} style={{ flex: 1 }}>
            {!flipped ? (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Badge label={card.category} />
                    <View style={{ marginTop: 8 }}>
                      <CategoryTrail category={card.category} subCategory={card.subCategory} topic={card.topic} size="sm" />
                    </View>
                  </View>
                  <Text style={{ color: c.textSecondary, fontSize: 11, fontFamily: fontCute }}>{index + 1}/{allCards.length}</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  {card.imageUrl ? (
                    <View style={{ width: '100%', marginBottom: 18 }}>
                      <QuestionImage uri={card.imageUrl} height={170} />
                    </View>
                  ) : (
                    <Ionicons name={getCategoryIcon(card.category)} size={40 * fs} color={c.primary} style={{ marginBottom: 12, opacity: 0.6 }} />
                  )}
                  {!!card.situation && (
                    <Text style={{ color: c.textSecondary, fontSize: 13 * fs, lineHeight: 20, textAlign: 'center', fontFamily: fontCute, marginBottom: 12 }}>
                      {card.situation}
                    </Text>
                  )}
                  <Text style={{ color: c.textPrimary, fontSize: 19 * fs, fontWeight: '700', lineHeight: 28, textAlign: 'center', fontFamily: fontCute }}>
                    {card.question}
                  </Text>
                  <View style={{ marginTop: 22 }}>
                    <CardTimer seconds={card.studySeconds} resetKey={card.id} onExpire={() => setFlipped(true)} />
                  </View>
                </View>
              </>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 4 }}>
                <View style={{ marginBottom: 12 }}>
                  <CategoryTrail category={card.category} subCategory={card.subCategory} topic={card.topic} size="sm" />
                </View>
                <CardBackBody card={card} />
              </ScrollView>
            )}
          </Pressable>
        </Animated.View>
      </Animated.View>

      {flipped && (
        <View style={{
          flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 32,
          paddingVertical: 14, paddingBottom: 24, borderTopWidth: 1, borderTopColor: c.border,
        }}>
          <Pressable onPress={() => { fireHaptic(); completeSwipe('left'); }}
            style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#FF3B30', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 8px rgba(255,59,48,0.3)', elevation: 5 }}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          <Text style={{ color: c.textSecondary, fontSize: 12, fontFamily: fontCute }}>{index + 1} / {allCards.length}</Text>
          <Pressable onPress={() => { fireHaptic(); completeSwipe('right'); }}
            style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#34C759', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 8px rgba(52,199,89,0.3)', elevation: 5 }}>
            <Ionicons name="checkmark" size={28} color="#fff" />
          </Pressable>
        </View>
      )}
    </View>
  );
}
