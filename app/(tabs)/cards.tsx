import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, ScrollView, Dimensions, Platform, BackHandler, Modal, PanResponder, Easing } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { hapticTap, hapticSuccess, hapticError } from '../../src/utils/haptics';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuthStore } from '../../src/store/authStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { getUxTrack } from '../../src/utils/uxTrack';
import { Button } from '../../src/components/ui/Button';
import { Badge } from '../../src/components/ui/Badge';
import { CardStudySkeleton } from '../../src/components/skeletons';
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
import { useDailyQuota, recordNewLearned } from '../../src/hooks/useDailyQuota';
import type { LearningCard } from '../../src/domain/models/LearningCard';
import { resolveCardImage } from '../../src/data/cardImages';
import { useBookmarkStore } from '../../src/store/bookmarkStore';
import { useReportStore } from '../../src/store/reportStore';
import { useCollectionStore } from '../../src/store/collectionStore';
import { useSrsStore } from '../../src/store/srsStore';

// 하루 학습 정책(운영 지속가능성 · '하루 3분'):
//  · '오늘의 학습'은 신규 카드만, 하루 상한(DAILY_NEW_LIMIT)까지만 진행할 수 있다.
//    상한을 채우면 그날은 더 이상 새 학습을 시작할 수 없다.
//  · 복습은 자유다 — 이전에 학습한 자료는 '복습' 탭에서 상한 없이 계속 볼 수 있다.
//  상한/사용량은 백엔드(learningQuotaRepository)가 권위를 갖고, 오프라인은 로컬 스토어로 집행한다.
const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');
// 스와이프 트랙(원진섭)에서 좌우로 넘겨 분류하는 최소 이동 거리.
const SWIPE_THRESHOLD = 90;

function haptic() {
  hapticTap();
}

// Fisher–Yates 셔플 — 원본을 건드리지 않고 새 배열을 반환.
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function notify(ok: boolean) {
  if (ok) hapticSuccess();
  else hapticError();
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
  const enterAnim = useRef(new Animated.Value(0)).current; // 다음 카드가 통통 튀며 등장하는 값(0→1)
  const progressAnim = useRef(new Animated.Value(0)).current;
  // 퀴즈 정답 선택 후 자동으로 뒤집기까지의 타이머.
  const autoFlipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 복습 탭에서 카테고리를 눌러 진입하면 category 파라미터로 해당 카테고리만 학습한다.
  // content 상세의 "이 카드 학습하기"로 진입하면 focusId(그 카드 1장)만 학습하고,
  // 끝나면 returnTo 경로(원래 보던 컨텐츠)로 되돌아간다.
  const { category, focusId, returnTo } = useLocalSearchParams<{ category?: string; focusId?: string; returnTo?: string }>();
  const isCategoryMode = !!category;
  const isFocusMode = !!focusId;

  const todayQuery = useTodayCards();
  const allQuery = useAllCards();
  const { isLoading, error, refetch } = (isCategoryMode || isFocusMode) ? allQuery : todayQuery;
  const markCardMutation = useMarkCard();

  // 학습 옵션(설정) — 카드 순서 섞기 / 약점 우선 복습 / '모를 때' 햅틱.
  const shuffleCards = useSettingsStore((s) => s.shuffleCards);
  const prioritizeWeakSpots = useSettingsStore((s) => s.prioritizeWeakSpots);
  const dontKnowHaptic = useSettingsStore((s) => s.dontKnowHaptic);

  // '모를 때(빨간 버튼/왼쪽 스와이프)'에만 주는 최소 햅틱 — 설정으로 끌 수 있다.
  const dnkHaptic = useCallback(() => {
    if (!dontKnowHaptic) return;
    hapticTap();
  }, [dontKnowHaptic]);
  const srsCards = useSrsStore((s) => s.cards);
  // 오늘 남은 신규 학습 수(하루 상한). 복습·단일카드 모드는 상한과 무관.
  const quota = useDailyQuota();

  // 오늘의 학습 = 신규 카드만, 하루 남은 상한(quota.remaining)까지. 카테고리 복습은 해당 카테고리 전체.
  // 이전에 학습한 자료의 반복은 '복습' 탭에서 자유롭게 진행한다(여기선 신규만 다룬다).
  const computedDeck = useMemo(() => {
    // 단일 카드(focus) 모드는 순서 옵션과 무관(1장).
    if (isFocusMode) return (allQuery.data ?? []).filter((x) => x.id === focusId);

    let base: LearningCard[];
    if (isCategoryMode) {
      base = (allQuery.data ?? []).filter((x) => x.category === category);
    } else {
      const today = todayQuery.data ?? [];
      // 오늘 남은 상한만큼만 신규 카드를 담는다(상한 소진 시 빈 덱 → '오늘 학습 완료' 안내).
      base = today.filter((x) => x.status === 'new').slice(0, quota.remaining);
    }

    // 약점 우선이 켜져 있으면 자주 잊는(lapses↑)·기억 약한(box↓) 카드를 앞으로.
    // 그렇지 않고 섞기가 켜져 있으면 무작위로 배열한다(두 옵션은 배타적으로 적용).
    if (prioritizeWeakSpots) {
      const weakScore = (id: string) => {
        const st = srsCards[id];
        return st ? st.lapses * 3 - st.box : 0;
      };
      return [...base].sort((a, b) => weakScore(b.id) - weakScore(a.id));
    }
    if (shuffleCards) return shuffle(base);
    return base;
  }, [isFocusMode, focusId, isCategoryMode, category, allQuery.data, todayQuery.data, prioritizeWeakSpots, shuffleCards, srsCards, quota.remaining]);

  // 덱은 세션 시작 시 한 번만 확정한다.
  // 카드를 마킹하면 cards 쿼리가 무효화되어 목록이 새로 내려오는데, 그때마다 덱을 다시 계산하면
  // (1) 'mastered' 카드는 오늘 목록에서 빠져 뒤 카드가 앞으로 당겨지므로 index 가 다른 카드를 가리켜 문제가 건너뛰어지고,
  // (2) 'learning' 으로 바뀐 신규 카드는 복습 구간에 다시 편입되어 같은 문제가 두 번 나온다.
  // 진행 중인 세션의 덱은 데이터 갱신과 무관하게 고정되어야 한다.
  const [sessionDeck, setSessionDeck] = useState<LearningCard[] | null>(null);
  const sessionKey = isFocusMode ? `focus:${focusId}` : isCategoryMode ? `category:${category}` : 'today';

  useEffect(() => {
    // 세션 대상(오늘 학습 / 카테고리 복습 / 단일 카드)이 바뀌면 덱뿐 아니라 진행 상태를
    // 전부 초기화한다. 그렇지 않으면 오늘 학습을 마친 뒤(복습 목록에서) 복습에 진입할 때
    // 이전 세션의 '완료' 상태가 남아 학습완료 화면이 먼저 떴다가 넘어가는 버그가 있었다.
    setSessionDeck(null);
    setFinished(false);
    setIndex(0);
    setDoneCount(0);
    setFlipped(false);
    setQuizPick(null);
    setQuizRevealed(false);
    setExiting(false);
  }, [sessionKey]);

  useEffect(() => {
    if (sessionDeck === null && computedDeck.length > 0) setSessionDeck(computedDeck);
  }, [sessionDeck, computedDeck]);

  const deck = sessionDeck ?? computedDeck;
  const card = deck[index];

  const toggleBookmark = useBookmarkStore((s) => s.toggle);
  const isBookmarked = useBookmarkStore((s) => (card ? s.ids.includes(card.id) : false));
  const hasReported = useReportStore((s) => (card ? s.reports.some((r) => r.cardId === card.id) : false));

  const keepScreenOn = useSettingsStore((s) => s.keepScreenOn);
  // const flexPromptEnabled = useSettingsStore((s) => s.flexPromptEnabled); // 학습완료 플렉스 CTA 비활성화로 미사용
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
    // 뒤집힘 — 튀는 스프링·스케일 팝 없이, 부드러운 이징으로 한 번에 매끄럽게 넘긴다.
    // (통통 튀던 과한 느낌을 걷어내고 종이를 넘기듯 잔잔하게.)
    Animated.timing(flipAnim, {
      toValue: next ? 1 : 0,
      duration: 360,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [flipAnim]);

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
    // '오늘의 학습'(신규) 모드에서 카드 하나를 마치면 하루 상한 사용량에 반영한다.
    // (카테고리 복습·단일 카드 학습은 상한과 무관하므로 집계하지 않는다.)
    if (!isCategoryMode && !isFocusMode && card.status === 'new') recordNewLearned(1);
    setDoneCount((n) => n + 1);
    setFlipped(false);
    setQuizPick(null);
    setQuizRevealed(false);
    resetCardAnims();
    enterAnim.setValue(0); // 다음 카드는 등장 애니메이션이 재생되도록 숨긴 상태에서 시작.
    setExiting(false);
    const nextIdx = index + 1;
    if (nextIdx >= deck.length) setFinished(true);
    else setIndex(nextIdx);
  }, [card, index, deck.length, markCardMutation, resetCardAnims, enterAnim, isCategoryMode, isFocusMode]);

  // 새 카드가 화면에 올라올 때 — 과한 바운스 없이 잔잔하게 떠오르며 등장한다(편안한 전환).
  useEffect(() => {
    if (!card || finished) return;
    enterAnim.setValue(0);
    const spring = Animated.spring(enterAnim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 10,
      tension: 48,
    });
    spring.start();
    return () => spring.stop();
  }, [card?.id, finished, enterAnim]);

  // "학습 완료" → 왼쪽으로 넘김.
  const completeLeft = useCallback(() => {
    if (exiting) return;
    setExiting(true);
    // '아는 것(학습 완료)'은 조용히 넘긴다 — 넘김 햅틱은 '모를 때'에만.
    Animated.parallel([
      Animated.timing(translateX, { toValue: -SCREEN_W - 80, duration: 300, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]).start(() => advance('mastered'));
  }, [exiting, translateX, cardOpacity, advance]);

  // "다음에 한번 더"(모를 때 = 빨간 버튼) → 위로 올림. 최소 햅틱을 준다.
  const againUp = useCallback(() => {
    if (exiting) return;
    setExiting(true);
    dnkHaptic();
    Animated.parallel([
      Animated.timing(translateY, { toValue: -SCREEN_H, duration: 320, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 0, duration: 280, useNativeDriver: true }),
    ]).start(() => advance('learning'));
  }, [exiting, translateY, cardOpacity, advance, dnkHaptic]);

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
    // 왼쪽(모르는 것=다시)만 최소 햅틱, 오른쪽(아는 것)은 조용히.
    if (status === 'learning') dnkHaptic();
    Animated.parallel([
      Animated.timing(translateX, { toValue: dir === 'right' ? SCREEN_W + 100 : -SCREEN_W - 100, duration: 280, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 0, duration: 240, useNativeDriver: true }),
    ]).start(() => advance(status));
  }, [exiting, translateX, cardOpacity, advance, dnkHaptic]);

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

  // 카드를 왼쪽으로 끄는 동작이 안드로이드 가장자리 '뒤로가기' 제스처로 오인되면
  // 시스템이 뒤로가기를 보내고, 하단 탭 네비게이터가 첫 탭(홈)으로 이동해 버린다.
  // 카드를 만지는 중/직후에 들어온 뒤로가기는 스와이프의 부작용으로 보고 삼킨다.
  const lastCardTouchRef = useRef(0);
  const SWIPE_BACK_GUARD_MS = 700;
  const markCardTouch = () => { lastCardTouchRef.current = Date.now(); };

  const panResponder = useRef(
    PanResponder.create({
      // 터치 시작을 기록만 하고 응답자는 가로채지 않는다(탭·퀴즈 보기 선택은 그대로 동작).
      onStartShouldSetPanResponderCapture: () => { markCardTouch(); return false; },
      onMoveShouldSetPanResponder: (_, g) =>
        swipeEnabledRef.current && Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
      onPanResponderMove: (_, g) => {
        markCardTouch();
        translateX.setValue(g.dx);
      },
      onPanResponderRelease: (_, g) => {
        markCardTouch();
        if (g.dx > SWIPE_THRESHOLD) trySwipeRef.current('right');
        else if (g.dx < -SWIPE_THRESHOLD) trySwipeRef.current('left');
        else Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 6 }).start();
      },
      onPanResponderTerminate: () => {
        // 시스템 제스처가 터치를 가져가면 여기로 온다 — 카드는 제자리로 되돌린다.
        markCardTouch();
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 6 }).start();
      },
    }),
  ).current;

  useEffect(() => {
    if (!finished) return;
    // 학습 세션을 마치면 안전 카드팩 적립(3회마다 1팩) — 수집 재미 요소.
    useCollectionStore.getState().addStudyProgress();
    // 단일 카드(focus) 학습이 끝나면 원래 보던 컨텐츠로 곧장 복귀.
    // 카테고리 복습이 끝나면 복습 목록으로, 오늘의 학습이 끝나면 통계로 이동.
    const target = returnTo ?? (isCategoryMode ? ROUTES.review : ROUTES.stats);
    const dur = returnTo ? 900 : 2000;
    Animated.timing(progressAnim, { toValue: 1, duration: dur, useNativeDriver: false }).start(({ finished: ok }) => {
      if (ok) router.replace(target as any);
    });
  }, [finished]);

  const restart = () => {
    if (autoFlipTimer.current) clearTimeout(autoFlipTimer.current);
    // 최신 학습 상태로 덱을 다시 뽑는다.
    setSessionDeck(null);
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
        // 카드 스와이프가 가장자리 뒤로가기 제스처로 오인된 경우 — 홈으로 튕기지 않도록 삼킨다.
        if (isSwipeTrack && Date.now() - lastCardTouchRef.current < SWIPE_BACK_GUARD_MS) return true;
        if (exitConfirm) {
          setExitConfirm(false); // 모달이 떠 있으면 모달만 닫는다(홈 이동 차단)
          return true;
        }
        if (sessionActive) {
          setExitConfirm(true);
          return true; // 기본 뒤로가기(홈 이동) 차단
        }
        return false;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [sessionActive, exitConfirm, isSwipeTrack]),
  );

  const leaveSession = useCallback((target: string) => {
    if (autoFlipTimer.current) clearTimeout(autoFlipTimer.current);
    setExitConfirm(false);
    router.replace(target as any);
  }, [router]);

  if (isLoading && deck.length === 0 && !error) {
    return <CardStudySkeleton />;
  }

  if (error && deck.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <ErrorState message="학습 카드를 불러올 수 없어요" onRetry={refetch} />
      </View>
    );
  }

  // 오늘의 신규 학습 상한을 모두 채운 상태로 진입 — '오늘 학습 완료' 안내 + 복습 유도.
  // (복습·단일카드 모드는 상한과 무관하므로 제외.)
  if (!isCategoryMode && !isFocusMode && !finished && quota.remaining === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 28 }}>
        <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: c.success + '1A', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <Ionicons name="checkmark-done" size={44} color={c.success} />
        </View>
        <Text style={{ color: c.textPrimary, fontSize: 22 * fs, fontWeight: '800', fontFamily: fontCute }}>오늘 학습 완료!</Text>
        <Text style={{ color: c.textSecondary, marginTop: 8, textAlign: 'center', lineHeight: 21 * fs, fontFamily: fontCute }}>
          오늘 신규 학습 {quota.limit}장을 모두 마쳤어요. 무리하지 않는 게 오래 가는 비결이에요.{'\n'}이전에 배운 내용은 <Text style={{ color: c.primary, fontWeight: '800' }}>복습</Text>에서 자유롭게 이어갈 수 있어요.
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18, backgroundColor: c.surfaceAlt, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 }}>
          <Ionicons name="time-outline" size={15} color={c.textSecondary} />
          <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, fontFamily: fontCute }}>내일 자정에 새 학습이 열려요</Text>
        </View>
        <Pressable
          onPress={() => router.replace(ROUTES.review as never)}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.primary, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 28, marginTop: 24, boxShadow: '0 6px 16px rgba(37,99,235,0.28)' }}
        >
          <Ionicons name="refresh" size={18} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 15 * fs, fontWeight: '800', fontFamily: fontCute }}>복습하러 가기</Text>
        </Pressable>
      </View>
    );
  }

  if (!card || finished) {
    const barWidth = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 52, marginBottom: 12 }}>🎉</Text>
        <Text style={{ color: c.textPrimary, fontSize: 22 * fs, fontWeight: '800', fontFamily: fontCute }}>{isCategoryMode ? '복습 완료!' : '학습 완료!'}</Text>
        <Text style={{ color: c.textSecondary, marginTop: 6, marginBottom: 28, fontFamily: fontCute }}>
          {isFocusMode ? '이 카드 학습을 마쳤어요' : isCategoryMode ? `${category} · ${doneCount}장 복습 완료 · 잘하셨어요!` : `오늘 ${doneCount}장 학습 완료 · 3분이면 충분해요`}
        </Text>
        <View style={{ width: '60%', height: 4, backgroundColor: c.surfaceAlt, borderRadius: 2, overflow: 'hidden', marginBottom: 24 }}>
          <Animated.View style={{ width: barWidth, height: '100%', backgroundColor: c.primary, borderRadius: 2 }} />
        </View>
        <Text style={{ color: c.textSecondary, fontSize: 12 * fs, fontFamily: fontCute }}>{isFocusMode ? '컨텐츠로 돌아가는 중...' : isCategoryMode ? '복습 목록으로 이동 중...' : '통계 화면으로 이동 중...'}</Text>
        {/* 목표 달성 순간의 '플렉스(자랑) 유도' — 요청에 따라 우선 비활성화(주석처리).
        {!isFocusMode && flexPromptEnabled && (
          <>
            <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, fontFamily: fontCute, marginTop: 22, marginBottom: -4 }}>오늘의 목표 달성! 성취를 자랑해볼까요?</Text>
            <Pressable
              onPress={() => { progressAnim.stopAnimation(); router.push(ROUTES.share as never); }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 22, marginTop: 12, boxShadow: '0 6px 16px rgba(37,99,235,0.28)' }}
            >
              <Ionicons name="sparkles" size={18} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 15 * fs, fontWeight: '800', fontFamily: fontCute }}>성취 카드 플렉스</Text>
            </Pressable>
          </>
        )}
        */}
        <View style={{ marginTop: 12 }}>
          <Button label="다시 학습하기" variant="outline" onPress={restart} />
        </View>
      </View>
    );
  }

  const isQuiz = card.type === 'ox' || card.type === 'choice';

  // 앞/뒤 rotateY 보간.
  const frontRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });

  // backfaceVisibility 만으로는 숨겨진 면이 그대로 비쳐 보여 문제가 두 개 겹쳐 보인다(웹·Android 모두 재현).
  // 뒤집힘의 절반을 기준으로 보이는 면만 불투명하게 만들어, backfaceVisibility 지원 여부와 무관하게 한 면만 보이도록 한다.
  const frontOpacity = flipAnim.interpolate({ inputRange: [0, 0.499, 0.5, 1], outputRange: [1, 1, 0, 0], extrapolate: 'clamp' });
  const backOpacity = flipAnim.interpolate({ inputRange: [0, 0.499, 0.5, 1], outputRange: [0, 0, 1, 1], extrapolate: 'clamp' });

  // 스와이프 트랙 — 좌우로 밀 때 나타나는 "아는 것/모르는 것" 라벨 투명도.
  const knowOpacity = translateX.interpolate({ inputRange: [30, 110], outputRange: [0, 1], extrapolate: 'clamp' });
  const dontKnowOpacity = translateX.interpolate({ inputRange: [-110, -30], outputRange: [1, 0], extrapolate: 'clamp' });

  // 새 카드 등장(fade-in): 아주 살짝 아래에서 떠오르며 페이드 인. 기존 뒤집기/스와이프 값과 합성.
  const enterScale = enterAnim.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] });
  const enterTranslateY = enterAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });
  const cardScale = Animated.multiply(scaleAnim, enterScale);
  const cardTranslateY = Animated.add(translateY, enterTranslateY);
  const cardCombinedOpacity = Animated.multiply(cardOpacity, enterAnim);

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
          style={{ flex: 1, transform: [{ translateX }, { translateY: cardTranslateY }, { scale: cardScale }], opacity: cardCombinedOpacity }}
        >
         <Pressable onPress={onCardPress} disabled={exiting} style={{ flex: 1 }}>
          {/* 앞면 */}
          <Animated.View
            // Android 는 backfaceVisibility 가 불안정해 숨겨진 뒷면이 터치를 가로챈다.
            // 보이는 면만 터치를 받도록 pointerEvents 를 토글한다(이미지 탭 확대 등 정상화).
            pointerEvents={flipped ? 'none' : 'auto'}
            style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
              borderRadius: 20, padding: 24,
              transform: [{ perspective: 1600 }, { rotateY: frontRotate }],
              backfaceVisibility: 'hidden',
              opacity: frontOpacity,
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
                    <QuestionImage source={resolveCardImage(card.imageUrl)} height={172} />
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
                    <CardTimer seconds={card.studySeconds} resetKey={card.id} onExpire={haptic} />
                  </View>
                )}
              </ScrollView>
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                {resolveCardImage(card.imageUrl) ? (
                  <View style={{ width: '100%', marginBottom: 18 }}>
                    <QuestionImage source={resolveCardImage(card.imageUrl)} height={200} />
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
                  <CardTimer seconds={card.studySeconds} resetKey={card.id} onExpire={haptic} />
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
              transform: [{ perspective: 1600 }, { rotateY: backRotate }],
              backfaceVisibility: 'hidden',
              opacity: backOpacity,
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
              <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 18, left: 18, opacity: knowOpacity, borderWidth: 3, borderColor: c.success, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: c.success + '1A' }}>
                <Text style={{ color: c.success, fontSize: 16 * fs, fontWeight: '900', fontFamily: fontCute }}>아는 것 👍</Text>
              </Animated.View>
              <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 18, right: 18, opacity: dontKnowOpacity, borderWidth: 3, borderColor: c.warning, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: c.warning + '1A' }}>
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
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.warning, borderRadius: 14, height: 52, boxShadow: `0 3px 8px ${c.warning}3D` }}>
                <Ionicons name="refresh-circle" size={19} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 15 * fs, fontWeight: '700', fontFamily: fontCute }}>다음에 한번 더</Text>
              </Pressable>
              <Pressable onPress={completeLeft} disabled={exiting}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.success, borderRadius: 14, height: 52, boxShadow: `0 3px 8px ${c.success}3D` }}>
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
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.success, borderRadius: 14, height: 52, boxShadow: `0 3px 8px ${c.success}3D` }}>
                  <Ionicons name="checkmark-circle" size={19} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 15 * fs, fontWeight: '700', fontFamily: fontCute }}>학습 완료</Text>
                </Pressable>
                <Pressable onPress={againUp} disabled={exiting}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.warning, borderRadius: 14, height: 52, boxShadow: `0 3px 8px ${c.warning}3D` }}>
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
              <Text style={{ color: c.textPrimary, fontSize: 17 * fs, fontWeight: '800', fontFamily: fontCute }}>{isCategoryMode ? '복습을 멈출까요?' : '학습을 멈출까요?'}</Text>
              <Text style={{ color: c.textSecondary, fontSize: 13 * fs, textAlign: 'center', marginTop: 6, lineHeight: 19, fontFamily: fontCute }}>
                {isCategoryMode ? '진행 중인 복습은 저장되지 않아요.' : '진행 중인 학습은 저장되지 않아요.'}{'\n'}어디로 이동할까요?
              </Text>
            </View>

            <Pressable onPress={() => setExitConfirm(false)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.primary, borderRadius: 14, paddingVertical: 14, marginTop: 8 }}>
              <Ionicons name="play" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 15 * fs, fontWeight: '700', fontFamily: fontCute }}>{isCategoryMode ? '계속 복습하기' : '계속 학습하기'}</Text>
            </Pressable>

            {/* 복습(카테고리) 세션은 '온 곳'인 복습 목록으로 돌아가는 것이 자연스럽다.
                복습 중 나가면 홈으로 튕기던 UX 대신, 복습으로 되돌아가기를 기본 이탈 경로로 강조한다. */}
            {isCategoryMode ? (
              <>
                <Pressable onPress={() => leaveSession(ROUTES.review)}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.primary, borderRadius: 14, paddingVertical: 13, marginTop: 10 }}>
                  <Ionicons name="refresh-outline" size={16} color={c.primary} />
                  <Text style={{ color: c.primary, fontSize: 14 * fs, fontWeight: '700', fontFamily: fontCute }}>복습 목록으로 돌아가기</Text>
                </Pressable>
                <Pressable onPress={() => leaveSession(ROUTES.home)} hitSlop={6} style={{ alignItems: 'center', paddingVertical: 12, marginTop: 4 }}>
                  <Text style={{ color: c.textSecondary, fontSize: 13 * fs, fontFamily: fontCute }}>홈으로 나가기</Text>
                </Pressable>
              </>
            ) : (
              <Pressable onPress={() => leaveSession(ROUTES.home)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border, borderRadius: 14, paddingVertical: 13, marginTop: 10 }}>
                <Ionicons name="home-outline" size={16} color={c.textPrimary} />
                <Text style={{ color: c.textPrimary, fontSize: 14 * fs, fontFamily: fontCute }}>홈으로 나가기</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
