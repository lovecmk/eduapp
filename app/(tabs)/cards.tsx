import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, ScrollView, Dimensions, Platform, BackHandler, Modal, PanResponder } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuthStore } from '../../src/store/authStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { getUxTrack } from '../../src/utils/uxTrack';
import { Button } from '../../src/components/ui/Button';
import { Badge } from '../../src/components/ui/Badge';
import { SkeletonLoader } from '../../src/components/ui/SkeletonLoader';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { QuestionImage } from '../../src/components/ui/QuestionImage';
import { CategoryTrail } from '../../src/components/ui/CategoryTrail';
import { CardTimer } from '../../src/components/cards/CardTimer';
import { CardBackBody } from '../../src/components/cards/CardBackBody';
import { CardQuiz } from '../../src/components/cards/CardQuiz';
import { CardReportModal } from '../../src/components/cards/CardReportModal';
import { fontCute } from '../../src/theme/tokens';
import { getCategoryIcon } from '../../src/constants/categories';
import { ROUTES } from '../../src/constants/routes';
import { useTodayCards, useAllCards, useMarkCard } from '../../src/hooks/useCards';
import { resolveCardImage } from '../../src/data/cardImages';
import { useBookmarkStore } from '../../src/store/bookmarkStore';
import { useReportStore } from '../../src/store/reportStore';

// 하루 학습 상한(운영 지속가능성) — 신규 3장 + 복습 최대 4장 = 하루 최대 7장.
// '하루 3분' 목표를 지키고 휴가·출장 후 누적으로 지치지 않도록 학습량을 고정한다.
// 정답률 66.7% 가정에서 복습 카드는 무한 누적되지 않고 장기적으로 하루 4~5장 내외로 안정화된다.
const NEW_PER_DAY = 3;
const REVIEW_PER_DAY = 4;
const DAILY_LIMIT = NEW_PER_DAY + REVIEW_PER_DAY; // 7
const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');
// 스와이프 트랙(원진섭)에서 좌우로 넘겨 분류하는 최소 이동 거리.
const SWIPE_THRESHOLD = 90;

function haptic() {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

function notify(ok: boolean) {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
}

export default function CardsScreen() {
  const { theme, fontScale } = useTheme();
  const c = theme.colors;
  const fs = fontScale;
  const router = useRouter();

  // 투트랙 UI — 원진섭 계정은 스와이프/탭 기반, 그 외는 기존 버튼 기반.
  const user = useAuthStore((s) => s.user);
  const isSwipeTrack = getUxTrack(user) === 'swipe';

  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [exiting, setExiting] = useState(false);
  // 퀴즈형(ox/choice) 앞면 정답 선택 상태.
  const [quizPick, setQuizPick] = useState<number | null>(null);
  const [quizRevealed, setQuizRevealed] = useState(false);
  // 퀴즈 미풀이 상태에서 넘기려 할 때 잠깐 노출되는 안내.
  const [solveHint, setSolveHint] = useState(false);
  // 뒤로가기 시 "어디로 이동할지" 묻는 확인 모달.
  const [exitConfirm, setExitConfirm] = useState(false);

  // 카드 뒤집기(rotateY) + 넘김(translate/opacity) 애니메이션 값.
  const flipAnim = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current; // 뒤집을 때 통통 튀는 스케일(귀여운 효과)
  const progressAnim = useRef(new Animated.Value(0)).current;
  // 퀴즈 정답 선택 후 자동으로 뒤집기까지의 타이머.
  const autoFlipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 복습 탭에서 카테고리를 눌러 진입하면 category 파라미터로 해당 카테고리만 학습한다.
  const { category } = useLocalSearchParams<{ category?: string }>();
  const isCategoryMode = !!category;

  const todayQuery = useTodayCards();
  const allQuery = useAllCards();
  const { isLoading, error, refetch } = isCategoryMode ? allQuery : todayQuery;
  const markCardMutation = useMarkCard();

  // 오늘의 학습 = 신규 3장 + 복습 최대 4장(총 최대 7장). 카테고리 복습은 해당 카테고리 전체.
  // 복습 카드는 예정일이 오래된 순(가장 오래 방치된 카드)으로 우선 배치한다.
  const deck = useMemo(() => {
    if (isCategoryMode) return (allQuery.data ?? []).filter((x) => x.category === category);
    const today = todayQuery.data ?? [];
    const news = today.filter((x) => x.status === 'new').slice(0, NEW_PER_DAY);
    const reviews = today
      .filter((x) => x.status === 'learning')
      .sort((a, b) => (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0))
      .slice(0, REVIEW_PER_DAY);
    return [...news, ...reviews];
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
    scaleAnim.setValue(1);
  }, [flipAnim, translateX, translateY, cardOpacity, scaleAnim]);

  const doFlip = useCallback((next: boolean) => {
    haptic();
    setFlipped(next);
    // 통통 튀며(살짝 작아졌다 스프링으로 복귀) 뒤집히는 귀여운 효과.
    Animated.parallel([
      Animated.spring(flipAnim, { toValue: next ? 1 : 0, useNativeDriver: true, friction: 6, tension: 26 }),
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 0.9, duration: 130, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, friction: 3.5, tension: 55 }),
      ]),
    ]).start();
  }, [flipAnim, scaleAnim]);

  // 퀴즈(OX/객관식) 보기 선택 → 정답/오답 이펙트(햅틱) 후 자동으로 카드가 뒤집혀 해설을 보여준다.
  const handleQuizPick = useCallback((i: number) => {
    if (quizRevealed || !card) return;
    const correct = i === (card.answerIndex ?? 0);
    setQuizPick(i);
    setQuizRevealed(true);
    notify(correct);
    if (autoFlipTimer.current) clearTimeout(autoFlipTimer.current);
    autoFlipTimer.current = setTimeout(() => doFlip(true), 1150);
  }, [quizRevealed, card, doFlip]);

  // 화면 이탈/카드 전환 시 예약된 자동 뒤집기 타이머 정리.
  useEffect(() => () => { if (autoFlipTimer.current) clearTimeout(autoFlipTimer.current); }, []);

  const advance = useCallback((status: 'mastered' | 'learning') => {
    if (!card) return;
    if (autoFlipTimer.current) clearTimeout(autoFlipTimer.current);
    markCardMutation.mutate({ id: card.id, status });
    setDoneCount((n) => n + 1);
    setFlipped(false);
    setQuizPick(null);
    setQuizRevealed(false);
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

  // ── 스와이프 트랙(원진섭) 전용 동작 ───────────────────────────────
  const solveHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 퀴즈를 풀지 않고 넘기려 할 때 — 카드를 좌우로 살짝 흔들고 안내를 띄운다.
  const shakeMustSolve = useCallback(() => {
    notify(false);
    Animated.sequence([
      Animated.timing(translateX, { toValue: -12, duration: 55, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: 12, duration: 55, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: -8, duration: 55, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: 8, duration: 55, useNativeDriver: true }),
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 5 }),
    ]).start();
    setSolveHint(true);
    if (solveHintTimer.current) clearTimeout(solveHintTimer.current);
    solveHintTimer.current = setTimeout(() => setSolveHint(false), 1600);
  }, [translateX]);

  useEffect(() => () => { if (solveHintTimer.current) clearTimeout(solveHintTimer.current); }, []);

  // 좌/우로 카드를 날려보내며 분류한다. (오른쪽=아는 것=학습 완료, 왼쪽=모르는 것=다시)
  const swipeAway = useCallback((dir: 'left' | 'right', status: 'mastered' | 'learning') => {
    if (exiting) return;
    setExiting(true);
    haptic();
    Animated.parallel([
      Animated.timing(translateX, { toValue: dir === 'right' ? SCREEN_W + 100 : -SCREEN_W - 100, duration: 280, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 0, duration: 240, useNativeDriver: true }),
    ]).start(() => advance(status));
  }, [exiting, translateX, cardOpacity, advance]);

  // 스와이프 시도 — 퀴즈 미풀이면 막고, 아니면 방향에 맞게 분류.
  const trySwipe = useCallback((dir: 'left' | 'right') => {
    if (!card) return;
    const isQuizCard = card.type === 'ox' || card.type === 'choice';
    if (isQuizCard && !quizRevealed) {
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 6 }).start();
      shakeMustSolve();
      return;
    }
    if (dir === 'right') swipeAway('right', 'mastered');
    else swipeAway('left', 'learning');
  }, [card, quizRevealed, translateX, shakeMustSolve, swipeAway]);

  // 카드 탭 — 앞면이면 뒤집고(퀴즈 미풀이면 막음), 뒷면이면 다시 앞으로.
  const onCardPress = useCallback(() => {
    if (exiting) return;
    if (!flipped) {
      const isQuizCard = card && (card.type === 'ox' || card.type === 'choice');
      if (isQuizCard && !quizRevealed) { shakeMustSolve(); return; }
      doFlip(true);
    } else {
      doFlip(false);
    }
  }, [exiting, flipped, card, quizRevealed, shakeMustSolve, doFlip]);

  // PanResponder 클로저가 최신 상태를 참조하도록 ref 로 미러링.
  const trySwipeRef = useRef(trySwipe);
  trySwipeRef.current = trySwipe;
  const swipeEnabledRef = useRef(false);
  swipeEnabledRef.current = isSwipeTrack && !exiting && !finished && !!card;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        swipeEnabledRef.current && Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
      onPanResponderMove: (_, g) => {
        translateX.setValue(g.dx);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx > SWIPE_THRESHOLD) trySwipeRef.current('right');
        else if (g.dx < -SWIPE_THRESHOLD) trySwipeRef.current('left');
        else Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 6 }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 6 }).start();
      },
    }),
  ).current;

  useEffect(() => {
    if (!finished) return;
    // 카테고리 복습 세션이 끝나면 복습 목록으로, 오늘의 학습이 끝나면 통계로 이동.
    const target = isCategoryMode ? ROUTES.review : ROUTES.stats;
    Animated.timing(progressAnim, { toValue: 1, duration: 2000, useNativeDriver: false }).start(({ finished: ok }) => {
      if (ok) router.replace(target as any);
    });
  }, [finished]);

  const restart = () => {
    if (autoFlipTimer.current) clearTimeout(autoFlipTimer.current);
    setIndex(0);
    setDoneCount(0);
    setFlipped(false);
    setFinished(false);
    setExiting(false);
    setQuizPick(null);
    setQuizRevealed(false);
    resetCardAnims();
    progressAnim.setValue(0);
  };

  // 학습 세션이 진행 중일 때(카드가 남아있고 아직 완료 화면이 아닐 때) 하드웨어 뒤로가기를 가로채,
  // 곧바로 홈으로 튕겨 나가는 대신 "어디로 이동할지" 확인 모달을 띄운다.
  const sessionActive = !!card && !finished;
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      const onBack = () => {
        if (sessionActive && !exitConfirm) {
          setExitConfirm(true);
          return true; // 기본 뒤로가기(홈 이동) 차단
        }
        return false;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [sessionActive, exitConfirm]),
  );

  const leaveSession = useCallback((target: string) => {
    if (autoFlipTimer.current) clearTimeout(autoFlipTimer.current);
    setExitConfirm(false);
    router.replace(target as any);
  }, [router]);

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

  const isQuiz = card.type === 'ox' || card.type === 'choice';

  // 앞/뒤 rotateY 보간.
  const frontRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });

  // 스와이프 트랙 — 좌우로 밀 때 나타나는 "아는 것/모르는 것" 라벨 투명도.
  const knowOpacity = translateX.interpolate({ inputRange: [30, 110], outputRange: [0, 1], extrapolate: 'clamp' });
  const dontKnowOpacity = translateX.interpolate({ inputRange: [-110, -30], outputRange: [1, 0], extrapolate: 'clamp' });

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
        <Animated.View
          {...(isSwipeTrack ? panResponder.panHandlers : {})}
          style={{ flex: 1, transform: [{ translateX }, { translateY }, { scale: scaleAnim }], opacity: cardOpacity }}
        >
         <Pressable onPress={onCardPress} disabled={!isSwipeTrack} style={{ flex: 1 }}>
          {/* 앞면 */}
          <Animated.View
            // Android 는 backfaceVisibility 가 불안정해 숨겨진 뒷면이 터치를 가로챈다.
            // 보이는 면만 터치를 받도록 pointerEvents 를 토글한다(이미지 탭 확대 등 정상화).
            pointerEvents={flipped ? 'none' : 'auto'}
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Badge label={card.category} />
                  {isQuiz && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: c.warning + '18', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Ionicons name="help-circle" size={12} color={c.warning} />
                      <Text style={{ color: c.warning, fontSize: 10.5, fontFamily: fontCute }}>{card.type === 'ox' ? 'OX 퀴즈' : '객관식'}</Text>
                    </View>
                  )}
                </View>
                <View style={{ marginTop: 8 }}>
                  <CategoryTrail category={card.category} subCategory={card.subCategory} topic={card.topic} size="sm" />
                </View>
              </View>
              <Text style={{ color: c.textSecondary, fontSize: 11, fontFamily: fontCute }}>{index + 1}/{deck.length}</Text>
            </View>
            {isQuiz ? (
              /* 퀴즈형: 상황·문제 + 앞면 정답 선택 UI */
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingVertical: 6 }}>
                {resolveCardImage(card.imageUrl) && (
                  <View style={{ width: '100%', marginBottom: 14 }}>
                    <QuestionImage source={resolveCardImage(card.imageUrl)} height={130} />
                  </View>
                )}
                {!!card.situation && (
                  <Text style={{ color: c.textSecondary, fontSize: 13.5 * fs, lineHeight: 20, textAlign: 'center', fontFamily: fontCute, marginBottom: 8 }}>
                    {card.situation}
                  </Text>
                )}
                <Text style={{ color: c.textPrimary, fontSize: 18 * fs, fontWeight: '700', lineHeight: 26, textAlign: 'center', fontFamily: fontCute, marginBottom: 18 }}>
                  {card.question}
                </Text>
                <CardQuiz
                  card={card}
                  pick={quizPick}
                  revealed={quizRevealed}
                  onPick={handleQuizPick}
                />
                {!quizRevealed && (
                  <View style={{ marginTop: 18, alignItems: 'center' }}>
                    <CardTimer seconds={card.studySeconds} resetKey={card.id} onExpire={() => setQuizRevealed(true)} />
                  </View>
                )}
              </ScrollView>
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                {resolveCardImage(card.imageUrl) ? (
                  <View style={{ width: '100%', marginBottom: 18 }}>
                    <QuestionImage source={resolveCardImage(card.imageUrl)} height={150} />
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
            )}
          </Animated.View>

          {/* 뒷면 */}
          <Animated.View
            pointerEvents={flipped ? 'auto' : 'none'}
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

          {/* 스와이프 방향 라벨 — 오른쪽=아는 것, 왼쪽=모르는 것 */}
          {isSwipeTrack && (
            <>
              <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 18, left: 18, opacity: knowOpacity, transform: [{ rotate: '-12deg' }], borderWidth: 3, borderColor: c.success, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: c.success + '1A' }}>
                <Text style={{ color: c.success, fontSize: 16 * fs, fontWeight: '900', fontFamily: fontCute }}>아는 것 👍</Text>
              </Animated.View>
              <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 18, right: 18, opacity: dontKnowOpacity, transform: [{ rotate: '12deg' }], borderWidth: 3, borderColor: c.warning, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: c.warning + '1A' }}>
                <Text style={{ color: c.warning, fontSize: 16 * fs, fontWeight: '900', fontFamily: fontCute }}>모르는 것 🔁</Text>
              </Animated.View>
            </>
          )}
         </Pressable>
        </Animated.View>
      </View>

      {/* 하단 컨트롤 */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 24, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.border }}>
        {isSwipeTrack ? (
          // 스와이프 트랙(원진섭) — 뒤집기 버튼 없이 탭/스와이프로 조작.
          !flipped ? (
            <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12 }}>
              <Ionicons name={solveHint ? 'alert-circle' : 'swap-horizontal-outline'} size={16} color={solveHint ? c.warning : c.textSecondary} />
              <Text style={{ color: solveHint ? c.warning : c.textSecondary, fontSize: 13 * fs, fontFamily: fontCute, textAlign: 'center' }}>
                {solveHint ? '문제를 먼저 풀어주세요!' : '카드를 탭해 뒤집고, 좌우로 넘겨 분류해요'}
              </Text>
            </View>
          ) : (
            // 버튼 위치 교체 — 왼쪽: 다음에 한번 더 / 오른쪽: 학습 완료
            <View style={{ flexDirection: 'row', gap: 10, height: 52 }}>
              <Pressable onPress={againUp} disabled={exiting}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FF3B30', borderRadius: 14, height: 52, boxShadow: '0 3px 8px rgba(255,59,48,0.28)', elevation: 4 }}>
                <Ionicons name="refresh-circle" size={19} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 15 * fs, fontWeight: '700', fontFamily: fontCute }}>다음에 한번 더</Text>
              </Pressable>
              <Pressable onPress={completeLeft} disabled={exiting}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#2563EB', borderRadius: 14, height: 52, boxShadow: '0 3px 8px rgba(37,99,235,0.28)', elevation: 4 }}>
                <Ionicons name="checkmark-circle" size={19} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 15 * fs, fontWeight: '700', fontFamily: fontCute }}>학습 완료</Text>
              </Pressable>
            </View>
          )
        ) : (
          // 클래식 트랙(이용재) — 뒤집기 버튼을 전/후 동일 위치·크기로 고정.
          <>
            <Pressable onPress={() => doFlip(!flipped)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border, borderRadius: 14, height: 50, marginBottom: 10 }}>
              <Ionicons name="sync-outline" size={18} color={c.primary} />
              <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontFamily: fontCute }}>카드 뒤집기</Text>
            </Pressable>
            {flipped ? (
              <View style={{ flexDirection: 'row', gap: 10, height: 52 }}>
                <Pressable onPress={completeLeft} disabled={exiting}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#2563EB', borderRadius: 14, height: 52, boxShadow: '0 3px 8px rgba(37,99,235,0.28)', elevation: 4 }}>
                  <Ionicons name="checkmark-circle" size={19} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 15 * fs, fontWeight: '700', fontFamily: fontCute }}>학습 완료</Text>
                </Pressable>
                <Pressable onPress={againUp} disabled={exiting}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FF3B30', borderRadius: 14, height: 52, boxShadow: '0 3px 8px rgba(255,59,48,0.28)', elevation: 4 }}>
                  <Ionicons name="arrow-up-circle" size={19} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 15 * fs, fontWeight: '700', fontFamily: fontCute }}>다음에 한번 더</Text>
                </Pressable>
              </View>
            ) : (
              // 뒤집기 전 — 액션 버튼 자리를 비워 뒤집기 버튼 위치가 고정되도록 한다.
              <View style={{ height: 52, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, fontFamily: fontCute }}>카드를 뒤집어 해설을 확인하세요</Text>
              </View>
            )}
          </>
        )}
      </View>

      <CardReportModal visible={reportOpen} card={card} onClose={() => setReportOpen(false)} />

      {/* 뒤로가기 시 이동 위치 확인 — '홈으로 튕기는' UX 방지 */}
      <Modal visible={exitConfirm} transparent animationType="fade" onRequestClose={() => setExitConfirm(false)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
          <Pressable style={{ position: 'absolute', inset: 0 }} onPress={() => setExitConfirm(false)} />
          <View style={{ width: '100%', maxWidth: 360, backgroundColor: c.surface, borderRadius: 22, borderWidth: 1, borderColor: c.border, padding: 22, boxShadow: '0 12px 40px rgba(0,0,0,0.35)', elevation: 16 }}>
            <View style={{ alignItems: 'center', marginBottom: 10 }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.warning + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <Ionicons name="exit-outline" size={26} color={c.warning} />
              </View>
              <Text style={{ color: c.textPrimary, fontSize: 17 * fs, fontWeight: '800', fontFamily: fontCute }}>학습을 멈출까요?</Text>
              <Text style={{ color: c.textSecondary, fontSize: 13 * fs, textAlign: 'center', marginTop: 6, lineHeight: 19, fontFamily: fontCute }}>
                진행 중인 학습은 저장되지 않아요.{'\n'}어디로 이동할까요?
              </Text>
            </View>

            <Pressable onPress={() => setExitConfirm(false)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.primary, borderRadius: 14, paddingVertical: 14, marginTop: 8 }}>
              <Ionicons name="play" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 15 * fs, fontWeight: '700', fontFamily: fontCute }}>계속 학습하기</Text>
            </Pressable>

            {isCategoryMode && (
              <Pressable onPress={() => leaveSession(ROUTES.review)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border, borderRadius: 14, paddingVertical: 13, marginTop: 10 }}>
                <Ionicons name="refresh-outline" size={16} color={c.textPrimary} />
                <Text style={{ color: c.textPrimary, fontSize: 14 * fs, fontFamily: fontCute }}>복습 목록으로</Text>
              </Pressable>
            )}

            <Pressable onPress={() => leaveSession(ROUTES.home)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border, borderRadius: 14, paddingVertical: 13, marginTop: 10 }}>
              <Ionicons name="home-outline" size={16} color={c.textPrimary} />
              <Text style={{ color: c.textPrimary, fontSize: 14 * fs, fontFamily: fontCute }}>홈으로 나가기</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
