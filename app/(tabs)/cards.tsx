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
import { ScrollFadeEdge } from '../../src/components/ui/ScrollFadeEdge';
import { useScrollHasMore } from '../../src/hooks/useScrollHasMore';
import { CardQuiz } from '../../src/components/cards/CardQuiz';
import { CardReportModal } from '../../src/components/cards/CardReportModal';
import { CardDifficultyAsk } from '../../src/components/cards/CardDifficultyAsk';
import { fontCute } from '../../src/theme/tokens';
import { getCategoryIcon } from '../../src/constants/categories';
import { ROUTES } from '../../src/constants/routes';
import { endFlow } from '../../src/navigation/flow';
import { useAllCards, useMarkCard } from '../../src/hooks/useCards';
import { useReview } from '../../src/hooks/useReview';
import { useDailyQuota, recordNewLearned } from '../../src/hooks/useDailyQuota';
import { useDailyAssignment } from '../../src/hooks/useDailyAssignment';
import type { LearningCard } from '../../src/domain/models/LearningCard';
import { resolveCardImage } from '../../src/data/cardImages';
import { useBookmarkStore } from '../../src/store/bookmarkStore';
import { useLikeStore } from '../../src/store/likeStore';
import { useReportStore } from '../../src/store/reportStore';
import { useCollectionStore } from '../../src/store/collectionStore';
import { useSrsStore } from '../../src/store/srsStore';
import { useDiffPollStore, type DiffVote } from '../../src/store/diffPollStore';
import { predictLabel, initialState } from '../../src/domain/srs';
import { safeInternalPath } from '../../src/utils/safeRoute';

// 하루 학습 정책(운영 지속가능성 · '하루 3분'):
//  · '오늘의 학습'은 신규 카드만, 하루 상한(DAILY_MIN_CARDS)까지만 진행할 수 있다.
//    상한을 채우면 그날은 더 이상 새 학습을 시작할 수 없다.
//  · 복습은 자유다 — 이전에 학습한 자료는 '복습' 탭에서 상한 없이 계속 볼 수 있다.
//  상한/사용량은 백엔드(learningQuotaRepository)가 권위를 갖고, 오프라인은 로컬 스토어로 집행한다.
const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');
// 스와이프 트랙(원진섭)에서 좌우로 넘겨 분류하는 최소 이동 거리.
const SWIPE_THRESHOLD = 90;
// 카드 그림자가 다시 차오르는 시간. 카드가 움직이는 동안에는 그림자를 지우고,
// 자리를 잡은 뒤에 서서히 되살려 '종이가 내려앉는' 느낌을 준다.
const SHADOW_FADE_MS = 420;
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
  /**
   * 세 스크롤 영역이 각각 '아래에 더 있는가' — 끝이 아니면 아래쪽을 옅게 가려 알린다.
   *
   * 앞면에도 두는 이유: 스크롤 영역이 직선으로 끝나면 경계에 걸린 글자가 반듯하게
   * 잘려, 사람은 그것을 '스크롤 중'이 아니라 **'화면이 깨졌다'** 로 읽는다.
   * 특히 퀴즈를 푼 뒤의 '아쉬워요 — 정답은 ②' 는 카드 경계에서 반으로 잘렸다.
   *
   * 앞면은 퀴즈형/설명형이 서로 다른 스크롤 영역이라 판단도 따로 해야 한다.
   * (하나로 묶으면 카드 종류가 바뀔 때 이전 카드의 높이가 남아 잘못 판단한다.)
   */
  const backBody = useScrollHasMore();
  const quizBody = useScrollHasMore();
  const frontBody = useScrollHasMore();
  const [exiting, setExiting] = useState(false);
  // 퀴즈형(ox/choice) 앞면 정답 선택 상태.
  const [quizPick, setQuizPick] = useState<number | null>(null);
  const [quizRevealed, setQuizRevealed] = useState(false);
  /**
   * 퀴즈 앞면 스크롤 영역 — 채점 직후 피드백 자리로 데려다주려고 잡아 둔다.
   *
   * 답을 고르면 보기 아래에 '정답이에요 / 아쉬워요 — 정답은 ②' 와 '카드를 탭하면
   * 해설을 볼 수 있어요' 가 새로 붙어 내용이 갑자기 길어진다. 그대로 두면 방금 받은
   * 채점 결과가 카드 경계 아래로 밀려, 사용자는 반쯤 잘린 글자를 보고 직접 밀어
   * 올려야 한다 — 정답을 확인하는 것은 이 화면에서 가장 중요한 순간인데도.
   */
  const quizScrollRef = useRef<ScrollView>(null);
  // 퀴즈 미풀이 상태에서 넘기려 할 때 잠깐 노출되는 안내.
  const [solveHint, setSolveHint] = useState(false);
  // 뒤로가기 시 "어디로 이동할지" 묻는 확인 모달.
  const [exitConfirm, setExitConfirm] = useState(false);
  /**
   * 한 문제를 마치고 넘어가기 직전에 묻는 체감 난이도(쉬움/중간/어려움).
   *
   * 카드를 날려보내기 전에 묻는다 — 방금 본 문제가 아직 화면에 있어야
   * "이 문제"가 무엇인지 헷갈리지 않는다. 답(또는 건너뛰기)을 받고 나서야
   * 미뤄 둔 넘김 동작을 실행한다.
   *
   * 아직 프론트 전용이다 — 로컬에만 남기고 서버로 보내지 않는다.
   */
  const [askVisible, setAskVisible] = useState(false);
  const pendingAdvanceRef = useRef<(() => void) | null>(null);
  const voteDifficulty = useDiffPollStore((s) => s.vote);

  // 카드 뒤집기(rotateY) + 넘김(translate/opacity) 애니메이션 값.
  const flipAnim = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current; // 뒤집을 때 통통 튀는 스케일(귀여운 효과)
  const enterAnim = useRef(new Animated.Value(0)).current; // 다음 카드가 통통 튀며 등장하는 값(0→1)
  const progressAnim = useRef(new Animated.Value(0)).current;
  /**
   * 카드 그림자의 진하기(0=없음, 1=완전).
   *
   * 그림자를 카드 면(앞/뒤)에 직접 주면 rotateY 로 도는 동안 평면 그림자가 뒤에 남아
   * 잔상(ghosting)이 된다. 그래서 그림자는 회전하지 않는 **별도의 판**이 지고,
   * 카드가 움직이는 동안(뒤집기·스와이프·넘김·등장)에는 그 판을 통째로 지운다.
   */
  const shadowAnim = useRef(new Animated.Value(0)).current;
  // 퀴즈 정답 선택 후 자동으로 뒤집기까지의 타이머.
  const autoFlipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 복습 탭에서 카테고리를 눌러 진입하면 category 파라미터로 해당 카테고리만 학습한다.
  // content 상세의 "이 카드 학습하기"로 진입하면 focusId(그 카드 1장)만 학습하고,
  // 끝나면 returnTo 경로(원래 보던 컨텐츠)로 되돌아간다.
  const { category, focusId, mode, returnTo: rawReturnTo } = useLocalSearchParams<{ category?: string; focusId?: string; mode?: string; returnTo?: string }>();
  // returnTo 는 주소창·딥링크로 아무 값이나 들어올 수 있다. 앱 내부 경로가 아니면 버린다
  // (웹에서 외부 주소로 사용자를 그대로 내보내는 열린 리다이렉트 방지).
  const returnTo = safeInternalPath(rawReturnTo);
  const isCategoryMode = !!category;
  const isFocusMode = !!focusId;
  // 복습 큐 모드 — 간격반복이 "지금 봐야 한다"고 판단한 카드만, 그 순서 그대로 푼다.
  // 오늘의 학습(신규 위주)과 목적이 다르다: 새로 배우는 게 아니라 무너지려는 기억을 붙잡는다.
  const isDueMode = mode === 'due';

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
  // 오늘 복습 예정(간격반복 도래) 카드 — '복습' 모드가 쓴다.
  const { dueCards } = useReview();
  // 오늘의 학습 — **서버가 편성한 목록**. 앱이 직접 고르지 않는다.
  const { assignment } = useDailyAssignment();

  // 오늘의 학습 = 신규(≤ 하루 상한) + 복습 도래 카드를 이어 붙여 최대 DAILY_MAX_CARDS장.
  // 카테고리 복습은 해당 카테고리 전체. 신규/복습 순서 옵션(섞기·약점우선)은 카테고리 복습에만 적용.
  const computedDeck = useMemo(() => {
    // 단일 카드(focus) 모드는 순서 옵션과 무관(1장).
    if (isFocusMode) return (allQuery.data ?? []).filter((x) => x.id === focusId);

    // 복습 큐 — 계획이 정한 순서를 그대로 쓴다.
    // 여기서 섞거나 다시 정렬하면 '가장 급한 카드부터'라는 계획의 의도가 사라진다.
    if (isDueMode) return dueCards;

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

    // 오늘의 학습 — 서버가 편성한 목록을 그대로 쓴다.
    //
    // 예전에는 여기서 직접 골랐다. "신규 카드를 쉬운 순으로 정렬해 앞에서 세 장."
    // 그 결과 (1) 진도가 같은 모든 사용자가 같은 문제를 같은 순서로 받았고,
    // (2) 세션을 마치지 않으면 다음 날에도 똑같은 카드가 나왔으며,
    // (3) 난이도는 정렬 순서만 바꿀 뿐 분량을 정하지 않았고,
    // (4) 관리자가 콘솔에서 출제 정책을 바꿔도 아무 일도 일어나지 않았다.
    //
    // 지금은 사람·날짜별 편성을 서버가 정하고(오프라인이면 같은 규칙으로 로컬에서),
    // 화면은 받은 것을 보여 주기만 한다. 이미 푼 문제는 빼서 이어서 하게 한다.
    return assignment.cards.filter((c) => !c.done).map((c) => c.card);
  }, [isFocusMode, focusId, isDueMode, isCategoryMode, category, allQuery.data, prioritizeWeakSpots, shuffleCards, srsCards, dueCards, assignment]);

  // 덱은 세션 시작 시 한 번만 확정한다.
  // 카드를 마킹하면 cards 쿼리가 무효화되어 목록이 새로 내려오는데, 그때마다 덱을 다시 계산하면
  // (1) 'mastered' 카드는 오늘 목록에서 빠져 뒤 카드가 앞으로 당겨지므로 index 가 다른 카드를 가리켜 문제가 건너뛰어지고,
  // (2) 'learning' 으로 바뀐 신규 카드는 복습 구간에 다시 편입되어 같은 문제가 두 번 나온다.
  // 진행 중인 세션의 덱은 데이터 갱신과 무관하게 고정되어야 한다.
  const [sessionDeck, setSessionDeck] = useState<LearningCard[] | null>(null);
  const sessionKey = isFocusMode ? `focus:${focusId}` : isDueMode ? 'due' : isCategoryMode ? `category:${category}` : 'today';

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

  /** 카드가 움직이기 시작하는 순간 — 그림자를 즉시 지운다(잔상 방지). */
  const hideCardShadow = useCallback(() => {
    shadowAnim.stopAnimation();
    shadowAnim.setValue(0);
  }, [shadowAnim]);

  /** 카드가 자리를 잡은 뒤 — 그림자를 서서히 되살린다. */
  const raiseCardShadow = useCallback((delay = 0) => {
    shadowAnim.stopAnimation();
    Animated.timing(shadowAnim, {
      toValue: 1,
      duration: SHADOW_FADE_MS,
      delay,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [shadowAnim]);

  const resetCardAnims = useCallback(() => {
    flipAnim.setValue(0);
    translateX.setValue(0);
    translateY.setValue(0);
    cardOpacity.setValue(1);
    scaleAnim.setValue(1);
    // 다음 카드는 그림자 없이 등장해, 내려앉으며 생긴다.
    // 차오르던 중이었다면 먼저 멈춰야 0 으로 되돌린 값이 곧바로 덮어써지지 않는다.
    shadowAnim.stopAnimation();
    shadowAnim.setValue(0);
  }, [flipAnim, translateX, translateY, cardOpacity, scaleAnim, shadowAnim]);

  const FLIP_DURATION = 360;
  const doFlip = useCallback((next: boolean) => {
    haptic();
    setFlipped(next);
    // 도는 동안에는 그림자를 지우고(잔상 방지), 다 돌아간 뒤 다시 차오르게 한다.
    hideCardShadow();
    raiseCardShadow(FLIP_DURATION + 40);
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
  }, [flipAnim, hideCardShadow, raiseCardShadow]);

  // 퀴즈(OX/객관식) 보기 선택 → 정답/오답 이펙트(햅틱)만 주고, 뒤집기는 하지 않는다.
  // 자동으로 넘어가면 정답을 곱씹을 새가 없어, 사용자가 카드를 직접 탭해 해설로 넘어가도록 둔다.
  const handleQuizPick = useCallback((i: number) => {
    if (quizRevealed || !card) return;
    const correct = i === (card.answerIndex ?? 0);
    setQuizPick(i);
    setQuizRevealed(true);
    notify(correct);
  }, [quizRevealed, card]);

  /**
   * 채점 직후 — 새로 붙은 피드백이 보이는 자리까지 스크롤한다.
   *
   * 한 프레임 늦춰서 부른다. 피드백은 이번 렌더에서 막 붙은 것이라, 곧바로 부르면
   * 스크롤 영역이 아직 예전 높이를 알고 있어 끝까지 가지 못한다.
   * 스크롤할 것이 없으면(짧은 카드) 아무 일도 일어나지 않는다.
   */
  useEffect(() => {
    if (!quizRevealed) return;
    const t = setTimeout(() => quizScrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [quizRevealed]);

  // 다음 카드로 넘어가면 앞면은 맨 위에서 시작해야 한다. 스크롤 위치는 카드가
  // 바뀌어도 남으므로, 그냥 두면 새 문제가 중간부터 보인다.
  useEffect(() => {
    quizScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [card?.id]);

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

  /**
   * 넘김 동작을 잠시 붙잡고 "이 문제 얼마나 어려웠나요?"를 먼저 묻는다.
   * 이미 답한 카드는 다시 묻지 않고 곧바로 넘긴다.
   */
  const askDifficulty = useCallback((run: () => void) => {
    if (!card) { run(); return; }
    if (useDiffPollStore.getState().myVotes[card.id]) { run(); return; }
    pendingAdvanceRef.current = run;
    // 스와이프로 밀려 있던 카드는 제자리로 되돌려 놓고 묻는다.
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 6 }).start();
    raiseCardShadow(140);
    setAskVisible(true);
  }, [card, translateX, raiseCardShadow]);

  /** 난이도를 고르거나 건너뛰면 — 미뤄 둔 넘김 동작을 그때 실행한다. */
  const resolveAsk = useCallback((choice: DiffVote | null) => {
    if (choice && card) voteDifficulty(card.id, choice);
    setAskVisible(false);
    const run = pendingAdvanceRef.current;
    pendingAdvanceRef.current = null;
    run?.();
  }, [card, voteDifficulty]);

  // 새 카드가 화면에 올라올 때 — 과한 바운스 없이 잔잔하게 떠오르며 등장한다(편안한 전환).
  useEffect(() => {
    if (!card || finished) return;
    enterAnim.setValue(0);
    // 떠오르는 동안에는 그림자가 없다가, 카드가 자리를 잡을 즈음 서서히 생긴다.
    hideCardShadow();
    const spring = Animated.spring(enterAnim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 10,
      tension: 48,
    });
    spring.start();
    raiseCardShadow(240);
    return () => spring.stop();
  }, [card?.id, finished, enterAnim, hideCardShadow, raiseCardShadow]);

  // "학습 완료" → 왼쪽으로 넘김.
  const completeLeft = useCallback(() => {
    if (exiting) return;
    askDifficulty(() => {
      setExiting(true);
      hideCardShadow();
      // '아는 것(학습 완료)'은 조용히 넘긴다 — 넘김 햅틱은 '모를 때'에만.
      Animated.parallel([
        Animated.timing(translateX, { toValue: -SCREEN_W - 80, duration: 300, useNativeDriver: true }),
        Animated.timing(cardOpacity, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]).start(() => advance('mastered'));
    });
  }, [exiting, translateX, cardOpacity, advance, askDifficulty, hideCardShadow]);

  // "다음에 한번 더"(모를 때 = 빨간 버튼) → 위로 올림. 최소 햅틱을 준다.
  const againUp = useCallback(() => {
    if (exiting) return;
    askDifficulty(() => {
      setExiting(true);
      hideCardShadow();
      dnkHaptic();
      Animated.parallel([
        Animated.timing(translateY, { toValue: -SCREEN_H, duration: 320, useNativeDriver: true }),
        Animated.timing(cardOpacity, { toValue: 0, duration: 280, useNativeDriver: true }),
      ]).start(() => advance('learning'));
    });
  }, [exiting, translateY, cardOpacity, advance, dnkHaptic, askDifficulty, hideCardShadow]);

  // ── 스와이프 트랙(원진섭) 전용 동작 ───────────────────────────────
  const solveHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 퀴즈를 풀지 않고 넘기려 할 때 — 카드를 좌우로 살짝 흔들고 안내를 띄운다.
  const shakeMustSolve = useCallback(() => {
    notify(false);
    hideCardShadow();
    Animated.sequence([
      Animated.timing(translateX, { toValue: -12, duration: 55, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: 12, duration: 55, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: -8, duration: 55, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: 8, duration: 55, useNativeDriver: true }),
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 5 }),
    ]).start();
    raiseCardShadow(300);
    setSolveHint(true);
    if (solveHintTimer.current) clearTimeout(solveHintTimer.current);
    solveHintTimer.current = setTimeout(() => setSolveHint(false), 1600);
  }, [translateX, hideCardShadow, raiseCardShadow]);

  useEffect(() => () => { if (solveHintTimer.current) clearTimeout(solveHintTimer.current); }, []);

  // 좌/우로 카드를 날려보내며 분류한다. (오른쪽=아는 것=학습 완료, 왼쪽=모르는 것=다시)
  const swipeAway = useCallback((dir: 'left' | 'right', status: 'mastered' | 'learning') => {
    if (exiting) return;
    askDifficulty(() => {
      setExiting(true);
      hideCardShadow();
      // 왼쪽(모르는 것=다시)만 최소 햅틱, 오른쪽(아는 것)은 조용히.
      if (status === 'learning') dnkHaptic();
      Animated.parallel([
        Animated.timing(translateX, { toValue: dir === 'right' ? SCREEN_W + 100 : -SCREEN_W - 100, duration: 280, useNativeDriver: true }),
        Animated.timing(cardOpacity, { toValue: 0, duration: 240, useNativeDriver: true }),
      ]).start(() => advance(status));
    });
  }, [exiting, translateX, cardOpacity, advance, dnkHaptic, askDifficulty, hideCardShadow]);

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

  /** 밀다 만 카드를 제자리로 되돌리고, 멈춘 뒤 그림자를 다시 채운다. */
  const settleBack = useCallback(() => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 6 }).start();
    raiseCardShadow(140);
  }, [translateX, raiseCardShadow]);
  const settleBackRef = useRef(settleBack);
  settleBackRef.current = settleBack;

  const panResponder = useRef(
    PanResponder.create({
      // 터치 시작을 기록만 하고 응답자는 가로채지 않는다(탭·퀴즈 보기 선택은 그대로 동작).
      onStartShouldSetPanResponderCapture: () => { markCardTouch(); return false; },
      onMoveShouldSetPanResponder: (_, g) =>
        swipeEnabledRef.current && Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
      onPanResponderMove: (_, g) => {
        markCardTouch();
        // 손가락을 따라 움직이는 동안에는 그림자를 지운다.
        shadowAnim.stopAnimation();
        shadowAnim.setValue(0);
        translateX.setValue(g.dx);
      },
      onPanResponderRelease: (_, g) => {
        markCardTouch();
        if (g.dx > SWIPE_THRESHOLD) trySwipeRef.current('right');
        else if (g.dx < -SWIPE_THRESHOLD) trySwipeRef.current('left');
        else settleBackRef.current();
      },
      onPanResponderTerminate: () => {
        // 시스템 제스처가 터치를 가져가면 여기로 온다 — 카드는 제자리로 되돌린다.
        markCardTouch();
        settleBackRef.current();
      },
    }),
  ).current;

  useEffect(() => {
    if (!finished) return;
    // 학습 세션을 마치면 안전 카드팩 적립 — 수집 재미 요소.
    // **장수(doneCount)로 적립한다.** 세션 단위로 1씩 올리면 하루에 한 번
    // 학습하는 보통 사용자는 '오늘 몇 장 학습' 조건(일일 무료팩)을 영원히
    // 못 채운다 — 적립 단위와 조건 단위가 같아야 한다.
    useCollectionStore.getState().addStudyProgress(doneCount);
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
    setAskVisible(false);
    pendingAdvanceRef.current = null;
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
    setAskVisible(false);
    pendingAdvanceRef.current = null;
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
  if (!isCategoryMode && !isFocusMode && !isDueMode && !finished && quota.remaining === 0 && deck.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 28 }}>
        <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: c.success + '1A', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <Ionicons name="checkmark-done" size={44} color={c.success} />
        </View>
        <Text style={{ color: c.textPrimary, fontSize: 22 * fs, fontWeight: '800', fontFamily: fontCute }}>오늘 학습 완료!</Text>
        <Text style={{ color: c.textSecondary, marginTop: 8, textAlign: 'center', lineHeight: 21 * fs, fontFamily: fontCute }}>
          오늘의 학습 {quota.limit}문제를 모두 마쳤어요.{'\n'}배운 내용은 <Text style={{ color: c.primary, fontWeight: '800' }}>복습</Text>에서 이어갈 수 있어요.
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18, backgroundColor: c.surfaceAlt, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 }}>
          <Ionicons name="time-outline" size={15} color={c.textSecondary} />
          <Text style={{ color: c.textSecondary, fontSize: 12.5 * fs, fontFamily: fontCute }}>내일 자정에 새 학습이 열려요</Text>
        </View>
        <Pressable accessibilityRole="button"
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
    const emptyTitle = isFocusMode
      ? '카드를 찾을 수 없어요'
      : isDueMode
        ? '지금 복습할 카드가 없어요'
        : isCategoryMode
          ? '복습할 카드가 없어요'
          : '지금 학습할 카드가 없어요';
    const emptyBody = isFocusMode
      ? '이 카드를 불러올 수 없어요. 이전 화면으로 돌아가 주세요.'
      : isDueMode
        ? // 복습이 비어 있는 것은 잘한 상태다 — 실패처럼 말하지 않는다.
          '지금은 다시 볼 때가 된 카드가 없어요. 때가 되면 복습 탭에서 알려드릴게요.'
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
        <Pressable accessibilityRole="button"
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
        <Text style={{ color: c.textPrimary, fontSize: 22 * fs, fontWeight: '800', fontFamily: fontCute }}>{isCategoryMode || isDueMode ? '복습 완료!' : '학습 완료!'}</Text>
        <Text style={{ color: c.textSecondary, marginTop: 6, marginBottom: 28, fontFamily: fontCute }}>
          {isFocusMode
            ? '이 카드 학습을 마쳤어요'
            : isDueMode
              ? `${doneCount}장 복습 완료 · 잊기 직전에 딱 붙잡았어요`
              : isCategoryMode
                ? `${category} · ${doneCount}장 복습 완료 · 잘하셨어요!`
                : `오늘 ${doneCount}장 학습 완료 · 3분이면 충분해요`}
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
            <Pressable accessibilityRole="button"
              onPress={() => endFlow(router, ROUTES.collection('today'))}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.primary, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 28, boxShadow: '0 6px 16px rgba(37,99,235,0.28)' }}
            >
              <Ionicons name="refresh" size={18} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 15 * fs, fontWeight: '800', fontFamily: fontCute }}>복습하러 가기</Text>
            </Pressable>
            <Pressable accessibilityRole="button"
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
  //
  // 그림자는 카드 면이 아니라 **회전하지 않는 별도의 판**(아래 '그림자 판')이 진다.
  // 면에 직접 주면 rotateY 로 도는 동안 평면 그림자가 뒤에 남아 잔상(ghosting)이 됐다.
  // 그 판은 카드가 움직이는 동안 지워졌다가, 멈춘 뒤 서서히 다시 차오른다(shadowAnim).
  const isLight = theme.mode === 'light';
  const cardShadow = isLight ? '0 10px 26px rgba(15,23,42,0.16)' : '0 10px 26px rgba(0,0,0,0.55)';
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
         {/* 카드 면 전체를 덮는 '탭하여 뒤집기' 판.

             역할(accessibilityRole)을 일부러 주지 않는다. 이 판 안에는 진짜 버튼들이
             들어 있고(앞면: 보기 선택·이미지 확대 / 뒷면: 추천·저장·신고), 버튼 안에
             버튼을 담으면 웹(react-native-web)에서는 <button> 안에 <button> 이 되어
             유효하지 않은 DOM 이 된다. 더 나쁜 것은 스크린 리더다 — 안쪽 버튼들이
             바깥 버튼의 이름에 통째로 묻혀, 카드 전체가 이름 하나짜리 덩어리로 읽힌다.

             그래서 이 판은 '이름 붙은 조작 요소'가 아니라 손가락을 위한 지름길로만 둔다.
             뒤집기라는 **행동 자체는** 이름을 가진 버튼이 따로 맡는다 — 클래식 트랙은
             아래 '카드 뒤집기' 버튼이, 스와이프 트랙은 아래 안내 줄이 그 역할을 한다.
             tabIndex={-1} 은 이름도 역할도 없는 자리에 키보드 초점이 멈추지 않게 한다. */}
         <Pressable tabIndex={-1} onPress={onCardPress} disabled={exiting} style={{ flex: 1 }}>
          {/* 그림자 판 — 카드와 같은 크기·모서리로 뒤에 깔린 채 회전하지 않는다.
              카드가 뒤집히거나 넘어가는 동안에는 opacity 0 이라 잔상이 남지 않고,
              카드가 자리를 잡으면 서서히 차올라 종이가 내려앉는 것처럼 보인다. */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              borderRadius: 20, backgroundColor: c.surface,
              boxShadow: cardShadow, elevation: 8,
              opacity: shadowAnim,
            }}
          />
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
              /* 퀴즈형: 상황·문제 + 앞면 정답 선택 UI.
                 답을 고르면 아래에 '정답/오답' 피드백이 새로 붙어 내용이 길어진다 —
                 카드 경계에서 반으로 잘리지 않도록 스크롤 영역으로 감싸고 가림막을 얹는다. */
              <View style={{ flex: 1 }}>
                <ScrollView
                  ref={quizScrollRef}
                  showsVerticalScrollIndicator
                  contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingVertical: 6 }}
                  {...quizBody.scrollProps}
                >
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
                <ScrollFadeEdge color={frontTint} visible={quizBody.hasMore} />
              </View>
            ) : (
              /* 설명형 앞면 — 문제/상황이 길면 카드 밖으로 잘리므로 스크롤 가능하게 두고,
                 짧을 때는 flexGrow + center 로 지금처럼 가운데 정렬을 유지한다. */
              <View style={{ flex: 1 }}>
                <ScrollView
                  showsVerticalScrollIndicator
                  contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 }}
                  {...frontBody.scrollProps}
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
                <ScrollFadeEdge color={frontTint} visible={frontBody.hasMore} />
              </View>
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
            <View style={{ flex: 1 }}>
              <ScrollView
                style={{ flex: 1 }}
                showsVerticalScrollIndicator
                // 마지막 줄이 구분선에 딱 붙지 않도록 넉넉히 띄운다.
                // 8px 이던 시절에는 태그 줄이 액션 행과 맞닿아 잘린 것처럼 보였다.
                contentContainerStyle={{ paddingBottom: 22 }}
                {...backBody.scrollProps}
              >
                <CardBackBody card={card} />
              </ScrollView>
              <ScrollFadeEdge color={backTint} visible={backBody.hasMore} />
            </View>
            {/* 카드 내부 오른쪽 하단 — 추천 / 저장 / 신고. 학습자가 조작하는 하단 버튼과 구분되는 '카드에 대한 반응'. */}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.border }}>
                <Pressable accessibilityRole="button" onPress={() => { haptic(); toggleLike(card.id); }} hitSlop={6}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: isLiked ? c.error + '18' : c.surfaceAlt, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8 }}>
                  <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={17} color={isLiked ? c.error : c.textSecondary} />
                  <Text style={{ color: isLiked ? c.error : c.textSecondary, fontSize: 13 * fs, fontFamily: fontCute }}>추천</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => { haptic(); toggleBookmark(card.id); }} hitSlop={6}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: isBookmarked ? c.primary + '18' : c.surfaceAlt, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8 }}>
                  <Ionicons name={isBookmarked ? 'bookmark' : 'bookmark-outline'} size={16} color={isBookmarked ? c.primary : c.textSecondary} />
                  <Text style={{ color: isBookmarked ? c.primary : c.textSecondary, fontSize: 13 * fs, fontFamily: fontCute }}>{isBookmarked ? '저장됨' : '저장'}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => setReportOpen(true)} hitSlop={6}
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

      {/* 하단 컨트롤 — 학습자가 조작하는 버튼(화면 중간 아래). 버튼 전환은 카드 회전 중간(backControls)에 맞춘다.

          **높이는 어떤 상태에서도 52 로 고정한다.** 이 블록이 커졌다 작아지면 위의 카드 영역
          (flex: 1)이 그만큼 늘었다 줄어, 카드 높이가 상태에 따라 달라 보인다. 안내 줄이든
          두 개짜리 액션 행이든 같은 높이를 차지하게 두어 학습카드 높이를 항상 같게 유지한다. */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 24, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.border, width: '100%', maxWidth: COLUMN_MAX, alignSelf: 'center' }}>
        {isSwipeTrack ? (
          // 스와이프 트랙(원진섭) — 뒤집기 버튼 없이 탭/스와이프로 조작.
          !backControls ? (
            // 이 안내 줄이 스와이프 트랙의 '이름 붙은 뒤집기 버튼'이다.
            //
            // 카드 면은 역할 없는 탭 판이라(위 참조) 스크린 리더·키보드에는 잡히지 않는다.
            // 클래식 트랙에는 아래에 '카드 뒤집기' 버튼이 있지만 이 트랙에는 없어서,
            // 그대로 두면 탭도 스와이프도 못 하는 사용자에게 뒤집을 방법이 사라진다.
            // 눈에 보이는 모습은 그대로 두고(글·아이콘·높이 모두 동일) 조작 가능하게만 한다 —
            // 마침 이 줄이 하는 말이 '카드를 탭해 뒤집고…' 라, 눌러서 뒤집히는 것이 자연스럽다.
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="카드 뒤집기"
              onPress={onCardPress}
              disabled={exiting}
              style={{ height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12 }}
            >
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
            </Pressable>
          ) : (
            // 버튼 위치 교체 — 왼쪽: 다음에 한번 더 볼게요 / 오른쪽: 이해했어요
            <View style={{ flexDirection: 'row', gap: 10, height: 52 }}>
              <Pressable accessibilityRole="button" onPress={againUp} disabled={exiting}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.warning, borderRadius: 14, height: 52, boxShadow: `0 3px 8px ${c.warning}3D` }}>
                <Ionicons name="refresh-circle" size={19} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 14.5 * fs, fontWeight: '700', fontFamily: fontCute }}>다음에 한번 더 볼게요</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={completeLeft} disabled={exiting}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.success, borderRadius: 14, height: 52, boxShadow: `0 3px 8px ${c.success}3D` }}>
                <Ionicons name="checkmark-circle" size={19} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 14.5 * fs, fontWeight: '700', fontFamily: fontCute }}>이해했어요</Text>
              </Pressable>
            </View>
          )
        ) : (
          // 클래식 트랙(이용재) — 별도 '카드 뒤집기' 버튼 없이 카드를 탭해 뒤집는다.
          !backControls ? (
            // 버튼을 없앴어도 뒤집기는 **이름을 가진 조작 요소**로 남아야 한다.
            //
            // 카드 면은 역할 없는 탭 판이라(위 참조) 스크린 리더·키보드에는 잡히지 않는다.
            // 예전에는 아래의 '카드 뒤집기' 버튼이 그 경로였는데, 버튼을 걷어낸 지금은
            // 이 안내 줄이 그 역할을 이어받는다 — 보이는 모습은 한 줄 안내 그대로 두고,
            // 눌리면 카드가 뒤집히게 한다(스와이프 트랙과 같은 방식).
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="카드 뒤집기"
              onPress={onCardPress}
              disabled={exiting}
              style={{ height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12 }}
            >
              <Ionicons
                name={nextReviewHint ? 'alarm-outline' : solveHint ? 'alert-circle' : 'sync-outline'}
                size={16}
                color={nextReviewHint ? c.primary : solveHint ? c.warning : c.textSecondary}
              />
              <Text style={{ color: nextReviewHint ? c.primary : solveHint ? c.warning : c.textSecondary, fontSize: 13 * fs, fontFamily: fontCute, textAlign: 'center' }}>
                {nextReviewHint
                  ? `다음 복습은 ${nextReviewHint} 뒤에 만나요`
                  : solveHint ? '문제를 먼저 풀어주세요!' : '카드를 탭하면 해설을 볼 수 있어요'}
              </Text>
            </Pressable>
          ) : (
            <View style={{ flexDirection: 'row', gap: 10, height: 52 }}>
              <Pressable accessibilityRole="button" onPress={completeLeft} disabled={exiting}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.success, borderRadius: 14, height: 52, boxShadow: `0 3px 8px ${c.success}3D` }}>
                <Ionicons name="checkmark-circle" size={19} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 14.5 * fs, fontWeight: '700', fontFamily: fontCute }}>이해했어요</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={againUp} disabled={exiting}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.warning, borderRadius: 14, height: 52, boxShadow: `0 3px 8px ${c.warning}3D` }}>
                <Ionicons name="arrow-up-circle" size={19} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 14.5 * fs, fontWeight: '700', fontFamily: fontCute }}>다음에 한번 더 볼게요</Text>
              </Pressable>
            </View>
          )
        )}
      </View>

      <CardReportModal visible={reportOpen} card={card} onClose={() => setReportOpen(false)} />

      {/* 한 문제를 풀고 넘어가기 직전 — 체감 난이도를 한 번 묻는다(프론트 전용). */}
      <CardDifficultyAsk
        visible={askVisible}
        onSelect={(choice) => resolveAsk(choice)}
        onSkip={() => resolveAsk(null)}
      />

      {/* 뒤로가기 시 이동 위치 확인 — '홈으로 튕기는' UX 방지 */}
      <Modal visible={exitConfirm} transparent animationType="fade" onRequestClose={() => setExitConfirm(false)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
          <Pressable accessibilityRole="button" style={{ position: 'absolute', inset: 0 }} onPress={() => setExitConfirm(false)} />
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

            <Pressable accessibilityRole="button" onPress={() => setExitConfirm(false)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.primary, borderRadius: 14, paddingVertical: 14, marginTop: 8 }}>
              <Ionicons name="play" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 15 * fs, fontWeight: '700', fontFamily: fontCute }}>{isCategoryMode ? '계속 복습하기' : '계속 학습하기'}</Text>
            </Pressable>

            {/* 복습(카테고리) 세션은 '온 곳'인 복습 목록으로 돌아가는 것이 자연스럽다.
                복습 중 나가면 홈으로 튕기던 UX 대신, 복습으로 되돌아가기를 기본 이탈 경로로 강조한다. */}
            {isCategoryMode ? (
              <>
                <Pressable accessibilityRole="button" onPress={() => leaveSession(ROUTES.review)}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.primary, borderRadius: 14, paddingVertical: 13, marginTop: 10 }}>
                  <Ionicons name="refresh-outline" size={16} color={c.primary} />
                  <Text style={{ color: c.primary, fontSize: 14 * fs, fontWeight: '700', fontFamily: fontCute }}>복습 목록으로 돌아가기</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => leaveSession(ROUTES.home)} hitSlop={6} style={{ alignItems: 'center', paddingVertical: 12, marginTop: 4 }}>
                  <Text style={{ color: c.textSecondary, fontSize: 13 * fs, fontFamily: fontCute }}>홈으로 나가기</Text>
                </Pressable>
              </>
            ) : (
              <Pressable accessibilityRole="button" onPress={() => leaveSession(ROUTES.home)}
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
