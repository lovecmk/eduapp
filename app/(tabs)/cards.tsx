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
import { endFlow } from '../../src/navigation/flow';
import { useAllCards, useMarkCard } from '../../src/hooks/useCards';
import { useReview } from '../../src/hooks/useReview';
import { useDailyQuota, recordNewLearned } from '../../src/hooks/useDailyQuota';
import { DAILY_TOTAL_LIMIT } from '../../src/constants/learning';
import type { LearningCard } from '../../src/domain/models/LearningCard';
import { resolveCardImage } from '../../src/data/cardImages';
import { useBookmarkStore } from '../../src/store/bookmarkStore';
import { useLikeStore } from '../../src/store/likeStore';
import { useReportStore } from '../../src/store/reportStore';
import { useCollectionStore } from '../../src/store/collectionStore';
import { useSrsStore } from '../../src/store/srsStore';
import { predictLabel, initialState } from '../../src/domain/srs';
import { safeInternalPath } from '../../src/utils/safeRoute';

// 하루 학습 정책(운영 지속가능성 · '하루 3분'):
//  · '오늘의 학습'은 신규 카드만, 하루 상한(DAILY_NEW_LIMIT)까지만 진행할 수 있다.
//    상한을 채우면 그날은 더 이상 새 학습을 시작할 수 없다.
//  · 복습은 자유다 — 이전에 학습한 자료는 '복습' 탭에서 상한 없이 계속 볼 수 있다.
//  상한/사용량은 백엔드(learningQuotaRepository)가 권위를 갖고, 오프라인은 로컬 스토어로 집행한다.
const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');
// 스와이프 트랙(원진섭)에서 좌우로 넘겨 분류하는 최소 이동 거리.
const SWIPE_THRESHOLD = 90;
// 신규 카드는 쉬운 난이도부터 보여줘 학습 부담을 낮춘다.
const DIFFICULTY_RANK: Record<string, number> = { easy: 0, medium: 1, hard: 2 };

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
  // 하단 버튼 전환을 카드 회전 '중간쯤'에 맞추기 위한 지연 상태.
  // flipped 는 즉시 바뀌지만(애니메이션 시작), 버튼은 카드가 반쯤 돌아갔을 때 나타나거나 사라진다.
  const [backControls, setBackControls] = useState(false);
  const controlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const { category, focusId, returnTo: rawReturnTo } = useLocalSearchParams<{ category?: string; focusId?: string; returnTo?: string }>();
  // returnTo 는 주소창·딥링크로 아무 값이나 들어올 수 있다. 앱 내부 경로가 아니면 버린다
  // (웹에서 외부 주소로 사용자를 그대로 내보내는 열린 리다이렉트 방지).
  const returnTo = safeInternalPath(rawReturnTo);
  const isCategoryMode = !!category;
  const isFocusMode = !!focusId;

  // 모든 모드가 전체 카드 풀(allQuery)에서 덱을 구성한다.
  //  · 카테고리/단일카드: 해당 조건으로 필터
  //  · 오늘의 학습(신규): 아직 학습하지 않은 '신규' 카드를 직접 고른다(복습 세션과 독립).
  const allQuery = useAllCards();
  const { isLoading, error, refetch } = allQuery;
  const markCardMutation = useMarkCard();
  // 채점 직후 '다음 복습까지' 안내(잠깐 떴다 사라진다).
  const [nextReviewHint, setNextReviewHint] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!nextReviewHint) return;
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setNextReviewHint(null), 1800);
    return () => { if (hintTimer.current) clearTimeout(hintTimer.current); };
  }, [nextReviewHint]);

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
  const srsGrade = useSrsStore((s) => s.grade);
  // 오늘 남은 신규 학습 수(하루 상한). 복습·단일카드 모드는 상한과 무관.
  const quota = useDailyQuota();
  // 오늘 복습 예정(간격반복 도래) 카드 — '오늘의 학습'에서 신규 뒤에 자동으로 이어 붙인다.
  const { dueCards } = useReview();

  // 오늘의 학습 = 신규(≤ 하루 상한) + 복습 도래 카드를 이어 붙여 최대 DAILY_TOTAL_LIMIT장.
  // 카테고리 복습은 해당 카테고리 전체. 신규/복습 순서 옵션(섞기·약점우선)은 카테고리 복습에만 적용.
  const computedDeck = useMemo(() => {
    // 단일 카드(focus) 모드는 순서 옵션과 무관(1장).
    if (isFocusMode) return (allQuery.data ?? []).filter((x) => x.id === focusId);

    if (isCategoryMode) {
      const base = (allQuery.data ?? []).filter((x) => x.category === category);
      // 카테고리 복습에서만 약점 우선/섞기 옵션을 적용한다.
      if (prioritizeWeakSpots) {
        const weakScore = (id: string) => {
          const st = srsCards[id];
          return st ? st.lapses * 3 - st.box : 0;
        };
        return [...base].sort((a, b) => weakScore(b.id) - weakScore(a.id));
      }
      if (shuffleCards) return shuffle(base);
      return base;
    }

    // 오늘의 학습(신규): 전체 풀에서 '신규' 카드를 쉬운 난이도부터, 하루 남은 상한까지.
    const newBase = (allQuery.data ?? [])
      .filter((x) => x.status === 'new')
      .sort((a, b) => DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty])
      .slice(0, quota.remaining);
    // 남는 자리를 복습(간격반복 도래) 카드로 채워 총 DAILY_TOTAL_LIMIT장까지. 신규→복습 순서 유지.
    const newIds = new Set(newBase.map((x) => x.id));
    const reviewFill = dueCards
      .filter((x) => !newIds.has(x.id))
      .slice(0, Math.max(0, DAILY_TOTAL_LIMIT - newBase.length));
    return [...newBase, ...reviewFill];
  }, [isFocusMode, focusId, isCategoryMode, category, allQuery.data, prioritizeWeakSpots, shuffleCards, srsCards, quota.remaining, dueCards]);

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
    setBackControls(false);
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
  const toggleLike = useLikeStore((s) => s.toggle);
  const isLiked = useLikeStore((s) => (card ? s.ids.includes(card.id) : false));
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

  const FLIP_DURATION = 360;
  const doFlip = useCallback((next: boolean) => {
    haptic();
    setFlipped(next);
    // 하단 버튼은 카드가 반쯤 돌아간 시점(≈절반)에 맞춰 나타나거나 사라지게 한다.
    if (controlTimer.current) clearTimeout(controlTimer.current);
    controlTimer.current = setTimeout(() => setBackControls(next), FLIP_DURATION * 0.48);
    // 뒤집힘 — 튀는 스프링·스케일 팝 없이, 부드러운 이징으로 한 번에 매끄럽게 넘긴다.
    // (통통 튀던 과한 느낌을 걷어내고 종이를 넘기듯 잔잔하게.)
    Animated.timing(flipAnim, {
      toValue: next ? 1 : 0,
      duration: FLIP_DURATION,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [flipAnim]);

  // 퀴즈(OX/객관식) 보기 선택 → 정답/오답 이펙트(햅틱)만 주고, 뒤집기는 하지 않는다.
  // 자동으로 넘어가면 정답을 곱씹을 새가 없어, 사용자가 카드를 직접 탭해 해설로 넘어가도록 둔다.
  const handleQuizPick = useCallback((i: number) => {
    if (quizRevealed || !card) return;
    const correct = i === (card.answerIndex ?? 0);
    setQuizPick(i);
    setQuizRevealed(true);
    notify(correct);
  }, [quizRevealed, card]);

  // 화면 이탈/카드 전환 시 예약된 타이머 정리.
  useEffect(() => () => {
    if (autoFlipTimer.current) clearTimeout(autoFlipTimer.current);
    if (controlTimer.current) clearTimeout(controlTimer.current);
  }, []);

  const advance = useCallback((status: 'mastered' | 'learning') => {
    if (!card) return;
    if (autoFlipTimer.current) clearTimeout(autoFlipTimer.current);
    markCardMutation.mutate({ id: card.id, status });
    if (!isCategoryMode && !isFocusMode) {
      // 오늘의 학습(신규+복습)은 모두 SRS 일정에 반영하고 그날 학습 기록(history)에 남긴다.
      // (알았음=good → 다음 복습 간격이 늘고, 몰랐음=again → 곧 다시 복습). 이렇게 하면
      // 신규 카드도 첫 복습 일정이 잡히고, 달력의 '완료/일부완료·카드수'가 정확해진다.
      const g = status === 'mastered' ? 'good' : 'again';
      // 알고리즘이 잡아준 '다음 복습까지'를 사용자에게 보여준다 —
      // 언제 다시 만나는지 알아야 '이해했어요/한번 더'가 의미 있는 선택이 된다.
      const prevState = useSrsStore.getState().cards[card.id] ?? initialState();
      setNextReviewHint(predictLabel(prevState, g));
      srsGrade(card.id, g);
      // 신규 카드 한 장을 마치면 하루 상한 사용량에도 집계(복습은 상한과 무관).
      if (card.status === 'new') recordNewLearned(1);
    }
    setDoneCount((n) => n + 1);
    setFlipped(false);
    if (controlTimer.current) clearTimeout(controlTimer.current);
    setBackControls(false);
    setQuizPick(null);
    setQuizRevealed(false);
    resetCardAnims();
    enterAnim.setValue(0); // 다음 카드는 등장 애니메이션이 재생되도록 숨긴 상태에서 시작.
    setExiting(false);
    const nextIdx = index + 1;
    if (nextIdx >= deck.length) setFinished(true);
    else setIndex(nextIdx);
  }, [card, index, deck.length, markCardMutation, srsGrade, resetCardAnims, enterAnim, isCategoryMode, isFocusMode]);

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
    // 단일 카드(focus) 학습만, 원래 보던 컨텐츠로 곧장 복귀(짧게).
    // 오늘의 학습·카테고리 복습은 자동으로 넘기지 않고 완료 화면에서 '대기'한다
    // (사용자가 직접 복습하러 가거나 홈으로 이동). 로딩바/이동 안내 문구도 두지 않는다.
    if (returnTo) {
      Animated.timing(progressAnim, { toValue: 1, duration: 900, useNativeDriver: false }).start(({ finished: ok }) => {
        if (ok) endFlow(router, returnTo);
      });
    }
  }, [finished]);

  const restart = () => {
    if (autoFlipTimer.current) clearTimeout(autoFlipTimer.current);
    // 최신 학습 상태로 덱을 다시 뽑는다.
    setSessionDeck(null);
    setIndex(0);
    setDoneCount(0);
    setFlipped(false);
    setBackControls(false);
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

  // 세션을 떠날 때는 endFlow 로 이동한다.
  // replace 만 쓰면 스택에 돌아갈 곳이 남지 않아, 도착한 화면에서 뒤로가기를 누르면
  // 앱이 그대로 종료된다. endFlow 는 홈을 깔고 목적지를 얹어 뒤로가기가 홈으로 가게 한다.
  const leaveSession = useCallback((target: string) => {
    if (autoFlipTimer.current) clearTimeout(autoFlipTimer.current);
    setExitConfirm(false);
    endFlow(router, target);
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

  // 오늘의 신규 상한을 다 채우고 복습 도래 카드도 없는 상태로 진입 — '오늘 학습 완료' 안내.
  // (복습이 남아 있으면 아래 세션에서 자동으로 이어 제시하므로 이 화면을 띄우지 않는다.)
  if (!isCategoryMode && !isFocusMode && !finished && quota.remaining === 0 && deck.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 28 }}>
        <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: c.success + '1A', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <Ionicons name="checkmark-done" size={44} color={c.success} />
        </View>
        <Text style={{ color: c.textPrimary, fontSize: 22 * fs, fontWeight: '800', fontFamily: fontCute }}>오늘 학습 완료!</Text>
        <Text style={{ color: c.textSecondary, marginTop: 8, textAlign: 'center', lineHeight: 21 * fs, fontFamily: fontCute }}>
          오늘 신규 학습 {quota.limit}장을 모두 마쳤어요.{'\n'}배운 내용은 <Text style={{ color: c.primary, fontWeight: '800' }}>복습</Text>에서 이어갈 수 있어요.
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18, backgroundColor: c.surfaceAlt, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 }}>
          <Ionicons name="time-outline" size={15} color={c.textSecondary} />
          <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, fontFamily: fontCute }}>내일 자정에 새 학습이 열려요</Text>
        </View>
        <Pressable
          onPress={() => endFlow(router, ROUTES.review)}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.primary, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 28, marginTop: 24, boxShadow: '0 6px 16px rgba(37,99,235,0.28)' }}
        >
          <Ionicons name="refresh" size={18} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 15 * fs, fontWeight: '800', fontFamily: fontCute }}>복습하러 가기</Text>
        </Pressable>
      </View>
    );
  }

  // 학습할 카드가 하나도 없는 경우 — '완료'가 아니라 '지금 학습할 것이 없음' 안내.
  // (한 장도 넘기지 않았는데 아래의 '학습 완료!' 축하 화면이 뜨던 버그 방지:
  //  finished 는 카드를 한 장이라도 마쳐야 true 가 되므로, 그 전의 빈 덱은 '완료'가 아니다.)
  if (!card && !finished) {
    const emptyTitle = isFocusMode ? '카드를 찾을 수 없어요' : isCategoryMode ? '복습할 카드가 없어요' : '지금 학습할 카드가 없어요';
    const emptyBody = isFocusMode
      ? '이 카드를 불러올 수 없어요. 이전 화면으로 돌아가 주세요.'
      : isCategoryMode
        ? '이 카테고리에는 아직 학습할 카드가 없어요.'
        : '새로 학습할 카드를 모두 마쳤어요. 복습에서 배운 내용을 다져보세요.';
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 28 }}>
        <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: c.primary + '14', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <Ionicons name="book-outline" size={42} color={c.primary} />
        </View>
        <Text style={{ color: c.textPrimary, fontSize: 22 * fs, fontWeight: '800', fontFamily: fontCute }}>{emptyTitle}</Text>
        <Text style={{ color: c.textSecondary, marginTop: 8, textAlign: 'center', lineHeight: 21 * fs, fontFamily: fontCute }}>{emptyBody}</Text>
        <Pressable
          onPress={() => endFlow(router, returnTo ?? (isFocusMode ? ROUTES.contents : ROUTES.review))}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.primary, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 28, marginTop: 24, boxShadow: '0 6px 16px rgba(37,99,235,0.28)' }}
        >
          <Ionicons name={isFocusMode ? 'arrow-back' : 'refresh'} size={18} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 15 * fs, fontWeight: '800', fontFamily: fontCute }}>{isFocusMode ? '돌아가기' : '복습하러 가기'}</Text>
        </Pressable>
      </View>
    );
  }

  if (finished) {
    const barWidth = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 52, marginBottom: 12 }}>🎉</Text>
        <Text style={{ color: c.textPrimary, fontSize: 22 * fs, fontWeight: '800', fontFamily: fontCute }}>{isCategoryMode ? '복습 완료!' : '학습 완료!'}</Text>
        <Text style={{ color: c.textSecondary, marginTop: 6, marginBottom: 28, fontFamily: fontCute }}>
          {isFocusMode ? '이 카드 학습을 마쳤어요' : isCategoryMode ? `${category} · ${doneCount}장 복습 완료 · 잘하셨어요!` : `오늘 ${doneCount}장 학습 완료 · 3분이면 충분해요`}
        </Text>

        {/* 단일 카드(focus) 학습만 원래 화면으로 자동 복귀(짧은 진행바). 그 외에는 자동 이동/로딩바 없이 대기. */}
        {isFocusMode ? (
          <>
            <View style={{ width: '60%', height: 4, backgroundColor: c.surfaceAlt, borderRadius: 2, overflow: 'hidden', marginBottom: 24 }}>
              <Animated.View style={{ width: barWidth, height: '100%', backgroundColor: c.primary, borderRadius: 2 }} />
            </View>
            <Text style={{ color: c.textSecondary, fontSize: 12 * fs, fontFamily: fontCute }}>컨텐츠로 돌아가는 중...</Text>
          </>
        ) : (
          <View style={{ width: '100%', gap: 10, marginTop: 4 }}>
            {/* '복습하러 가기' — 방금 학습한 카드를 복습 > 모아보기 > 오늘 학습한 카드에서 바로 다시 본다. */}
            <Pressable
              onPress={() => endFlow(router, ROUTES.collection('today'))}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.primary, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 28, boxShadow: '0 6px 16px rgba(37,99,235,0.28)' }}
            >
              <Ionicons name="refresh" size={18} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 15 * fs, fontWeight: '800', fontFamily: fontCute }}>복습하러 가기</Text>
            </Pressable>
            <Pressable
              onPress={() => endFlow(router, ROUTES.home)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.surfaceAlt, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 28, borderWidth: 1, borderColor: c.border }}
            >
              <Ionicons name="home-outline" size={18} color={c.textPrimary} />
              <Text style={{ color: c.textPrimary, fontSize: 15 * fs, fontWeight: '800', fontFamily: fontCute }}>홈으로</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  const isQuiz = card.type === 'ox' || card.type === 'choice';

  // 카드 톤 — 앞/뒷면 모두 같은 표면색(surface)을 쓰고, '테두리 색'만 달리해 면을 구분한다.
  // (배경색을 서로 다르게 칠하면 디자인적으로 튀어, 자연스러운 종이 느낌이 깨진다.)
  // 학습카드는 그림자를 아예 두지 않는다 — rotateY(3D 회전) 중 평면 그림자가 뒤에 남아
  // 잔상(ghosting)을 만들었다. 대신 '또렷한 테두리'로 카드 면을 분명히 세워 눈에 잘 띄게 한다.
  const isLight = theme.mode === 'light';
  const frontTint = c.surface; // 앞면: 표면색(중립)
  const backTint = c.surface; // 뒷면: 동일 표면색 — 배경으로는 구분하지 않는다
  const frontBorder = c.primary + (isLight ? '80' : 'A6'); // 앞면: 또렷한 파랑 테두리
  const backBorder = c.success + (isLight ? '80' : 'A6'); // 뒷면: 또렷한 초록 테두리(면 구분은 테두리로만)
  // 태블릿·와이드 화면에서 글자가 좌우로 과하게 퍼지지 않도록 학습 컬럼 폭을 제한(가운데 정렬).
  const COLUMN_MAX = 560;

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
        <Pressable onPress={toggleKeepScreenOn} accessibilityRole="button" accessibilityLabel="화면 꺼짐 방지 해제" style={{ position: 'absolute', top: 10, right: 20, zIndex: 20, padding: 4 }}>
          <Ionicons name="lock-closed" size={16} color={c.textSecondary} />
        </Pressable>
      )}

      <View style={{ paddingHorizontal: 20, paddingTop: 12, width: '100%', maxWidth: COLUMN_MAX, alignSelf: 'center' }}>
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
      <View style={{ flex: 1, padding: 20, paddingBottom: 8, width: '100%', maxWidth: COLUMN_MAX, alignSelf: 'center' }}>
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
              backgroundColor: frontTint, borderWidth: 2, borderColor: frontBorder,
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
                  <Text style={{ color: c.textPrimary, fontSize: 13.5 * fs, lineHeight: 20, textAlign: 'center', fontFamily: fontCute, marginBottom: 8 }}>
                    {card.situation}
                  </Text>
                )}
                <Text style={{ color: c.primary, fontSize: 18 * fs, fontWeight: '800', lineHeight: 26, textAlign: 'center', fontFamily: fontCute, marginBottom: 18 }}>
                  <Text style={{ fontWeight: '900' }}>Q. </Text>{card.question}
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
              /* 설명형 앞면 — 문제/상황이 길면 카드 밖으로 잘리므로 스크롤 가능하게 두고,
                 짧을 때는 flexGrow + center 로 지금처럼 가운데 정렬을 유지한다. */
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 }}
              >
                {resolveCardImage(card.imageUrl) ? (
                  <View style={{ width: '100%', marginBottom: 18 }}>
                    <QuestionImage source={resolveCardImage(card.imageUrl)} height={200} />
                  </View>
                ) : (
                  <Ionicons name={getCategoryIcon(card.category)} size={40 * fs} color={c.primary} style={{ marginBottom: 12, opacity: 0.6 }} />
                )}
                {!!card.situation && (
                  <Text style={{ color: c.textPrimary, fontSize: 16.5 * fs, lineHeight: 25, textAlign: 'center', fontFamily: fontCute, marginBottom: 14 }}>
                    {card.situation}
                  </Text>
                )}
                <Text style={{ color: c.primary, fontSize: 20 * fs, fontWeight: '800', lineHeight: 29, textAlign: 'center', fontFamily: fontCute }}>
                  <Text style={{ fontWeight: '900' }}>Q. </Text>{card.question}
                </Text>
                <View style={{ marginTop: 20 }}>
                  <CardTimer seconds={card.studySeconds} resetKey={card.id} onExpire={haptic} />
                </View>
              </ScrollView>
            )}
          </Animated.View>

          {/* 뒷면 */}
          <Animated.View
            pointerEvents={flipped ? 'auto' : 'none'}
            style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: backTint, borderWidth: 2, borderColor: backBorder,
              borderRadius: 20, padding: 22,
              transform: [{ perspective: 1600 }, { rotateY: backRotate }],
              backfaceVisibility: 'hidden',
              opacity: backOpacity,
            }}
          >
            <View style={{ marginBottom: 12 }}>
              <CategoryTrail category={card.category} subCategory={card.subCategory} topic={card.topic} size="sm" />
            </View>
            {/* 해설은 스크롤, 액션 행은 카드 하단에 고정.
                (예전엔 액션 행도 ScrollView 안에 있어, 해설이 길면 카드 밖으로 밀려
                 '추천/저장/신고'가 잘려 보이지 않았다.) */}
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator contentContainerStyle={{ paddingBottom: 8 }}>
              <CardBackBody card={card} />
            </ScrollView>
            {/* 카드 내부 오른쪽 하단 — 추천 / 저장 / 신고. 학습자가 조작하는 하단 버튼과 구분되는 '카드에 대한 반응'. */}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.border }}>
                <Pressable onPress={() => { haptic(); toggleLike(card.id); }} hitSlop={6}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: isLiked ? c.error + '18' : c.surfaceAlt, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8 }}>
                  <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={17} color={isLiked ? c.error : c.textSecondary} />
                  <Text style={{ color: isLiked ? c.error : c.textSecondary, fontSize: 13 * fs, fontFamily: fontCute }}>추천</Text>
                </Pressable>
                <Pressable onPress={() => { haptic(); toggleBookmark(card.id); }} hitSlop={6}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: isBookmarked ? c.primary + '18' : c.surfaceAlt, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8 }}>
                  <Ionicons name={isBookmarked ? 'bookmark' : 'bookmark-outline'} size={16} color={isBookmarked ? c.primary : c.textSecondary} />
                  <Text style={{ color: isBookmarked ? c.primary : c.textSecondary, fontSize: 13 * fs, fontFamily: fontCute }}>{isBookmarked ? '저장됨' : '저장'}</Text>
                </Pressable>
                <Pressable onPress={() => setReportOpen(true)} hitSlop={6}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: hasReported ? c.warning + '18' : c.surfaceAlt, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8 }}>
                  <Ionicons name={hasReported ? 'flag' : 'flag-outline'} size={16} color={hasReported ? c.warning : c.textSecondary} />
                  <Text style={{ color: hasReported ? c.warning : c.textSecondary, fontSize: 13 * fs, fontFamily: fontCute }}>{hasReported ? '신고됨' : '신고'}</Text>
                </Pressable>
            </View>
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

      {/* 하단 컨트롤 — 학습자가 조작하는 버튼(화면 중간 아래). 버튼 전환은 카드 회전 중간(backControls)에 맞춘다. */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 24, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.border, width: '100%', maxWidth: COLUMN_MAX, alignSelf: 'center' }}>
        {isSwipeTrack ? (
          // 스와이프 트랙(원진섭) — 뒤집기 버튼 없이 탭/스와이프로 조작.
          !backControls ? (
            <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12 }}>
              <Ionicons
                name={nextReviewHint ? 'alarm-outline' : solveHint ? 'alert-circle' : 'swap-horizontal-outline'}
                size={16}
                color={nextReviewHint ? c.primary : solveHint ? c.warning : c.textSecondary}
              />
              <Text style={{ color: nextReviewHint ? c.primary : solveHint ? c.warning : c.textSecondary, fontSize: 13 * fs, fontFamily: fontCute, textAlign: 'center' }}>
                {nextReviewHint
                  ? `다음 복습은 ${nextReviewHint} 뒤에 만나요`
                  : solveHint ? '문제를 먼저 풀어주세요!' : '카드를 탭해 뒤집고, 좌우로 넘겨 분류해요'}
              </Text>
            </View>
          ) : (
            // 버튼 위치 교체 — 왼쪽: 다음에 한번 더 볼게요 / 오른쪽: 이해했어요
            <View style={{ flexDirection: 'row', gap: 10, height: 52 }}>
              <Pressable onPress={againUp} disabled={exiting}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.warning, borderRadius: 14, height: 52, boxShadow: `0 3px 8px ${c.warning}3D` }}>
                <Ionicons name="refresh-circle" size={19} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 14.5 * fs, fontWeight: '700', fontFamily: fontCute }}>다음에 한번 더 볼게요</Text>
              </Pressable>
              <Pressable onPress={completeLeft} disabled={exiting}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.success, borderRadius: 14, height: 52, boxShadow: `0 3px 8px ${c.success}3D` }}>
                <Ionicons name="checkmark-circle" size={19} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 14.5 * fs, fontWeight: '700', fontFamily: fontCute }}>이해했어요</Text>
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
            {backControls ? (
              <View style={{ flexDirection: 'row', gap: 10, height: 52 }}>
                <Pressable onPress={completeLeft} disabled={exiting}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.success, borderRadius: 14, height: 52, boxShadow: `0 3px 8px ${c.success}3D` }}>
                  <Ionicons name="checkmark-circle" size={19} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 14.5 * fs, fontWeight: '700', fontFamily: fontCute }}>이해했어요</Text>
                </Pressable>
                <Pressable onPress={againUp} disabled={exiting}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.warning, borderRadius: 14, height: 52, boxShadow: `0 3px 8px ${c.warning}3D` }}>
                  <Ionicons name="arrow-up-circle" size={19} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 14.5 * fs, fontWeight: '700', fontFamily: fontCute }}>다음에 한번 더 볼게요</Text>
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
