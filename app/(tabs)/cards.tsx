import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, ScrollView, Dimensions, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
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
import { CardReportModal } from '../../src/components/cards/CardReportModal';
import { fontCute } from '../../src/theme/tokens';
import { getCategoryIcon } from '../../src/constants/categories';
import { ROUTES } from '../../src/constants/routes';
import { useTodayCards, useAllCards, useMarkCard } from '../../src/hooks/useCards';
import { useBookmarkStore } from '../../src/store/bookmarkStore';
import { useReportStore } from '../../src/store/reportStore';

// 하루 학습량 = 3분 분량(카드당 30~40초 기준 3~5장).
const DAILY_LIMIT = 5;
const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');

function haptic() {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export default function CardsScreen() {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  const fs = fontScale;
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [exiting, setExiting] = useState(false);

  // 카드 뒤집기(rotateY) + 넘김(translate/opacity) 애니메이션 값.
  const flipAnim = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  // 복습 탭에서 카테고리를 눌러 진입하면 category 파라미터로 해당 카테고리만 학습한다.
  const { category } = useLocalSearchParams<{ category?: string }>();
  const isCategoryMode = !!category;

  const todayQuery = useTodayCards();
  const allQuery = useAllCards();
  const { isLoading, error, refetch } = isCategoryMode ? allQuery : todayQuery;
  const markCardMutation = useMarkCard();

  // 오늘의 학습 세션은 3~5장으로 제한(3분 분량). 카테고리 복습은 해당 카테고리 전체.
  const deck = useMemo(() => {
    if (isCategoryMode) return (allQuery.data ?? []).filter((x) => x.category === category);
    return (todayQuery.data ?? []).slice(0, DAILY_LIMIT);
  }, [isCategoryMode, category, allQuery.data, todayQuery.data]);
  const card = deck[index];

  const toggleBookmark = useBookmarkStore((s) => s.toggle);
  const isBookmarked = useBookmarkStore((s) => (card ? s.ids.includes(card.id) : false));
  const hasReported = useReportStore((s) => (card ? s.reports.some((r) => r.cardId === card.id) : false));

  const keepScreenOn = useSettingsStore((s) => s.keepScreenOn);
  const toggleKeepScreenOn = useSettingsStore((s) => s.toggleKeepScreenOn);

  const resetCardAnims = useCallback(() => {
    flipAnim.setValue(0);
    translateX.setValue(0);
    translateY.setValue(0);
    cardOpacity.setValue(1);
  }, [flipAnim, translateX, translateY, cardOpacity]);

  const doFlip = useCallback((next: boolean) => {
    haptic();
    setFlipped(next);
    Animated.spring(flipAnim, { toValue: next ? 1 : 0, useNativeDriver: true, friction: 8, tension: 10 }).start();
  }, [flipAnim]);

  const advance = useCallback((status: 'mastered' | 'learning') => {
    if (!card) return;
    markCardMutation.mutate({ id: card.id, status });
    setDoneCount((n) => n + 1);
    setFlipped(false);
    resetCardAnims();
    setExiting(false);
    const nextIdx = index + 1;
    if (nextIdx >= deck.length) setFinished(true);
    else setIndex(nextIdx);
  }, [card, index, deck.length, markCardMutation, resetCardAnims]);

  // "학습 완료" → 왼쪽으로 넘김.
  const completeLeft = useCallback(() => {
    if (exiting) return;
    setExiting(true);
    haptic();
    Animated.parallel([
      Animated.timing(translateX, { toValue: -SCREEN_W - 80, duration: 300, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]).start(() => advance('mastered'));
  }, [exiting, translateX, cardOpacity, advance]);

  // "다음에 한번 더" → 위로 올림.
  const againUp = useCallback(() => {
    if (exiting) return;
    setExiting(true);
    haptic();
    Animated.parallel([
      Animated.timing(translateY, { toValue: -SCREEN_H, duration: 320, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 0, duration: 280, useNativeDriver: true }),
    ]).start(() => advance('learning'));
  }, [exiting, translateY, cardOpacity, advance]);

  useEffect(() => {
    if (!finished) return;
    // 카테고리 복습 세션이 끝나면 복습 목록으로, 오늘의 학습이 끝나면 통계로 이동.
    const target = isCategoryMode ? ROUTES.review : ROUTES.stats;
    Animated.timing(progressAnim, { toValue: 1, duration: 2000, useNativeDriver: false }).start(({ finished: ok }) => {
      if (ok) router.replace(target as any);
    });
  }, [finished]);

  const restart = () => {
    setIndex(0);
    setDoneCount(0);
    setFlipped(false);
    setFinished(false);
    setExiting(false);
    resetCardAnims();
    progressAnim.setValue(0);
  };

  if (isLoading && deck.length === 0 && !error) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <SkeletonLoader count={3} />
      </View>
    );
  }

  if (error && deck.length === 0) {
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
        <Text style={{ color: c.textSecondary, marginTop: 6, marginBottom: 28, fontFamily: fontCute }}>
          {isCategoryMode ? `${category} · ${doneCount}장 복습 완료` : `오늘 ${doneCount}장 학습 완료 · 3분이면 충분해요`}
        </Text>
        <View style={{ width: '60%', height: 4, backgroundColor: c.surfaceAlt, borderRadius: 2, overflow: 'hidden', marginBottom: 24 }}>
          <Animated.View style={{ width: barWidth, height: '100%', backgroundColor: c.primary, borderRadius: 2 }} />
        </View>
        <Text style={{ color: c.textSecondary, fontSize: 12 * fs, fontFamily: fontCute }}>{isCategoryMode ? '복습 목록으로 이동 중...' : '통계 화면으로 이동 중...'}</Text>
        <View style={{ marginTop: 20 }}>
          <Button label="다시 학습하기" variant="outline" onPress={restart} />
        </View>
      </View>
    );
  }

  // 앞/뒤 rotateY 보간.
  const frontRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });

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
            <Ionicons name={isCategoryMode ? 'refresh-outline' : 'school-outline'} size={16} color={c.primary} />
            <Text style={{ color: c.textPrimary, fontSize: 14 * fs, fontFamily: fontCute }}>{isCategoryMode ? `${category} 복습` : '오늘의 학습'}</Text>
          </View>
          <Text style={{ color: c.textSecondary, fontSize: 12, fontFamily: 'monospace' }}>{index + 1} / {deck.length}</Text>
        </View>
        <View style={{ height: 6, backgroundColor: c.surfaceAlt, borderRadius: 3, overflow: 'hidden' }}>
          <View style={{ width: `${Math.round((index / Math.max(deck.length, 1)) * 100)}%`, height: '100%', backgroundColor: c.primary, borderRadius: 3 }} />
        </View>
      </View>

      {/* 카드(뒤집기 애니메이션) */}
      <View style={{ flex: 1, padding: 20, paddingBottom: 8 }}>
        <Animated.View style={{ flex: 1, transform: [{ translateX }, { translateY }], opacity: cardOpacity }}>
          {/* 앞면 */}
          <Animated.View
            style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
              borderRadius: 20, padding: 24,
              transform: [{ perspective: 1200 }, { rotateY: frontRotate }],
              backfaceVisibility: 'hidden',
              boxShadow: '0 4px 16px rgba(0,0,0,0.06)', elevation: 4,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Badge label={card.category} />
                <View style={{ marginTop: 8 }}>
                  <CategoryTrail category={card.category} subCategory={card.subCategory} topic={card.topic} size="sm" />
                </View>
              </View>
              <Text style={{ color: c.textSecondary, fontSize: 11, fontFamily: fontCute }}>{index + 1}/{deck.length}</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              {card.imageUrl ? (
                <View style={{ width: '100%', marginBottom: 18 }}>
                  <QuestionImage uri={card.imageUrl} height={150} />
                </View>
              ) : (
                <Ionicons name={getCategoryIcon(card.category)} size={40 * fs} color={c.primary} style={{ marginBottom: 12, opacity: 0.6 }} />
              )}
              {!!card.situation && (
                <Text style={{ color: c.textSecondary, fontSize: 16.5 * fs, lineHeight: 25, textAlign: 'center', fontFamily: fontCute, marginBottom: 14 }}>
                  {card.situation}
                </Text>
              )}
              <Text style={{ color: c.textPrimary, fontSize: 20 * fs, fontWeight: '700', lineHeight: 29, textAlign: 'center', fontFamily: fontCute }}>
                {card.question}
              </Text>
              <View style={{ marginTop: 20 }}>
                <CardTimer seconds={card.studySeconds} resetKey={card.id} onExpire={() => doFlip(true)} />
              </View>
            </View>
          </Animated.View>

          {/* 뒷면 */}
          <Animated.View
            style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
              borderRadius: 20, padding: 22,
              transform: [{ perspective: 1200 }, { rotateY: backRotate }],
              backfaceVisibility: 'hidden',
              boxShadow: '0 4px 16px rgba(0,0,0,0.06)', elevation: 4,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <CategoryTrail category={card.category} subCategory={card.subCategory} topic={card.topic} size="sm" />
              {/* 저장 / 신고하기 */}
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Pressable onPress={() => { haptic(); toggleBookmark(card.id); }} hitSlop={6}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: isBookmarked ? c.primary + '18' : c.surfaceAlt, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
                  <Ionicons name={isBookmarked ? 'bookmark' : 'bookmark-outline'} size={13} color={isBookmarked ? c.primary : c.textSecondary} />
                  <Text style={{ color: isBookmarked ? c.primary : c.textSecondary, fontSize: 11, fontFamily: fontCute }}>{isBookmarked ? '저장됨' : '저장'}</Text>
                </Pressable>
                <Pressable onPress={() => setReportOpen(true)} hitSlop={6}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: hasReported ? c.warning + '18' : c.surfaceAlt, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
                  <Ionicons name={hasReported ? 'flag' : 'flag-outline'} size={13} color={hasReported ? c.warning : c.textSecondary} />
                  <Text style={{ color: hasReported ? c.warning : c.textSecondary, fontSize: 11, fontFamily: fontCute }}>{hasReported ? '신고됨' : '신고하기'}</Text>
                </Pressable>
              </View>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 4 }}>
              <CardBackBody card={card} />
            </ScrollView>
          </Animated.View>
        </Animated.View>
      </View>

      {/* 하단 컨트롤 */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 24, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.border }}>
        {!flipped ? (
          <Pressable onPress={() => doFlip(true)}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border, borderRadius: 14, paddingVertical: 15 }}>
            <Ionicons name="sync-outline" size={18} color={c.primary} />
            <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontFamily: fontCute }}>카드 뒤집기</Text>
          </Pressable>
        ) : (
          <>
            <Pressable onPress={() => doFlip(false)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingVertical: 11, marginBottom: 10 }}>
              <Ionicons name="sync-outline" size={16} color={c.textSecondary} />
              <Text style={{ color: c.textSecondary, fontSize: 13.5 * fs, fontFamily: fontCute }}>카드 뒤집기</Text>
            </Pressable>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={completeLeft} disabled={exiting}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#2563EB', borderRadius: 14, paddingVertical: 15, boxShadow: '0 3px 8px rgba(37,99,235,0.28)', elevation: 4 }}>
                <Ionicons name="checkmark-circle" size={19} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 15 * fs, fontWeight: '700', fontFamily: fontCute }}>학습 완료</Text>
              </Pressable>
              <Pressable onPress={againUp} disabled={exiting}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FF3B30', borderRadius: 14, paddingVertical: 15, boxShadow: '0 3px 8px rgba(255,59,48,0.28)', elevation: 4 }}>
                <Ionicons name="arrow-up-circle" size={19} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 15 * fs, fontWeight: '700', fontFamily: fontCute }}>다음에 한번 더</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>

      <CardReportModal visible={reportOpen} card={card} onClose={() => setReportOpen(false)} />
    </View>
  );
}
