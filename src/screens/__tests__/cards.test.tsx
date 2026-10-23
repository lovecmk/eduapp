// 학습 카드 화면 — 조작 요소 구조 회귀 테스트.
//
// 과거 버그: 카드 면 전체가 '탭하여 뒤집기' Pressable(accessibilityRole="button")이고
// 그 **안에** 진짜 버튼들이 들어 있었다 — 앞면의 보기 선택·이미지 확대, 뒷면의
// 추천·저장·신고. 웹(react-native-web)은 role="button" 을 진짜 <button> 으로 그리므로
// <button> 안에 <button> 이 되어 유효하지 않은 DOM 이었고, 스크린 리더는 카드 전체를
// 이름 하나짜리 덩어리로 읽어 안쪽 버튼들이 통째로 묻혔다.
//
// 지금은 카드 면이 '역할 없는 탭 판'이다. 그래서 두 가지를 함께 고정한다.
//  1) 버튼 안에 버튼이 없다.
//  2) 그럼에도 '뒤집기'는 이름을 가진 버튼으로 여전히 닿을 수 있다 —
//     클래식 트랙은 '카드 뒤집기' 버튼이, 스와이프 트랙은 안내 줄이 그 역할을 한다.
//     (1)만 있으면 역할을 떼는 것으로 통과해 버리므로, 접근 경로까지 함께 묶어야 한다.

const mockPush = jest.fn();
const mockMark = jest.fn(() => Promise.resolve());
let mockRestDay = false;
let mockParams: { category?: string; focusId?: string } = {};
let mockAvailableCards: LearningCard[] = [];
let mockAssignedCards: LearningCard[] | null = null;
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useNavigation: () => undefined,
  useLocalSearchParams: () => mockParams,
  // 포커스 시점의 뒤로가기 가로채기 — 이 검사와 무관하다.
  useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]),
}));

// 데이터 훅은 네트워크·react-query 를 끌고 온다. 화면 구조만 보므로 덱 한 장으로 고정한다.
jest.mock('../../hooks/useCards', () => ({
  useAllCards: () => ({ data: mockAvailableCards, isLoading: false, error: null, refetch: jest.fn() }),
  useMarkCard: () => ({ mutate: mockMark, mutateAsync: mockMark }),
}));
jest.mock('../../hooks/useReview', () => ({ useReview: () => ({ dueCards: [] }) }));
jest.mock('../../hooks/useDifficultyPoll', () => ({
  useDifficultyVote: () => jest.fn(),
  useDifficultyPoll: () => ({ counts: null, mine: null, loaded: true }),
}));
jest.mock('../../hooks/useDailyQuota', () => ({
  useDailyQuota: () => ({ limit: mockRestDay ? 0 : 3, used: 0, remaining: mockRestDay ? 0 : 3, canLearn: !mockRestDay, isRestDay: mockRestDay, restDayName: '주말' }),
  recordNewLearned: jest.fn(),
}));
jest.mock('../../hooks/useDailyAssignment', () => ({
  DAILY_ASSIGNMENT_KEY: 'daily-assignment',
  useDailyAssignment: () => ({ assignment: { cards: (mockAssignedCards ?? [mockCard]).map(card => ({ card, done: false })) } }),
}));

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Animated } from 'react-native';
import { useDiffPollStore } from '../../store/diffPollStore';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import CardsScreen from '../../../app/(tabs)/cards';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { useAuthStore } from '../../store/authStore';
import { useAccountRestoreStore } from '../../store/accountRestoreStore';
import { getSessionEpoch } from '../../data/network/sessionEpoch';
import { useSrsStore } from '../../store/srsStore';
import { useSettingsStore } from '../../store/settingsStore';
import { nestedButtonLabels, type TreeNode } from '../../test-utils/nestedButtons';
import type { LearningCard } from '../../domain/models/LearningCard';
import type { User } from '../../domain/models/User';

// 객관식 + 이미지 카드 — 앞면에 '진짜 버튼'이 가장 많이 생기는 조합이다
// (보기 4개 + 이미지 확대).
const mockCard: LearningCard = {
  id: 'c-1',
  category: '전기 위험',
  subCategory: '배선설비',
  topic: '전기화재 기본',
  keywords: ['과전류'],
  title: '과전류 차단',
  difficulty: 'easy',
  studySeconds: 30,
  type: 'choice',
  situation: '분전반에서 탄 냄새가 난다.',
  question: '가장 먼저 할 일은?',
  imageUrl: '1-1', // 번들된 로컬 이미지 키 — QuestionImage 가 실제로 그려진다
  choices: ['차단기를 내린다', '물을 뿌린다', '그냥 둔다', '문을 닫는다'],
  answerIndex: 0,
  principle: '과전류는 도체를 발열시킨다.',
  conclusion: '먼저 전원을 끊는다.',
  hasImage: true,
  status: 'new',
  dueAt: null,
};

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const userNamed = (name: string): User => ({
  id: 'u-1',
  name,
  email: 'test@example.com',
  membership: 'basic',
  createdAt: new Date(),
  isActive: true,
  isAdmin: false,
});

/** 트랙은 로그인 이름으로 갈린다(uxTrack) — 스와이프 트랙은 '원진섭'. */
const wrap = (name: string, recovered = true) => {
  useAuthStore.setState({ user: userNamed(name) } as never);
  useAccountRestoreStore.setState({ entries: { progress: { userId: 'u-1', epoch: getSessionEpoch(), status: recovered ? 'ready' : 'loading' } } });
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>
        <CardsScreen />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
};

const nested = () => nestedButtonLabels(screen.UNSAFE_root as unknown as TreeNode);

it('재설치 직후 학습 기록 복원이 끝나기 전에는 빈 SRS로 학습을 시작하지 않는다', () => {
  useSrsStore.getState().reset();
  wrap('이용재', false);
  expect(screen.getByTestId('learning-recovery-gate')).toBeTruthy();
  expect(screen.queryAllByText(mockCard.question, { exact: false })).toHaveLength(0);
  expect(useSrsStore.getState().cards).toEqual({});
});

it('주말에 단일 신규 카드로 직접 진입해도 문제를 열거나 학습 기록을 만들지 않는다', () => {
  mockRestDay = true; mockParams = { focusId: mockCard.id }; mockAvailableCards = [mockCard];
  useSrsStore.getState().reset();
  try {
    wrap('이용재');
    expect(screen.getByText('오늘은 신규 학습 쉬는 날')).toBeTruthy();
    expect(screen.queryAllByText(mockCard.question, { exact: false })).toHaveLength(0);
    expect(useSrsStore.getState().cards).toEqual({});
  } finally { mockRestDay = false; mockParams = {}; mockAvailableCards = []; }
});

it('주말 카테고리 복습에서 기존 카드는 열고 신규 카드는 제외한다', () => {
  mockRestDay = true; mockParams = { category: mockCard.category };
  const review: LearningCard = { ...mockCard, id: 'already-studied', status: 'learning', question: '기존 학습 복습 문제' };
  mockAvailableCards = [mockCard, review];
  useSrsStore.getState().reset();
  try {
    wrap('이용재');
    expect(screen.getAllByText(review.question, { exact: false }).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(mockCard.question, { exact: false })).toHaveLength(0);
  } finally { mockRestDay = false; mockParams = {}; mockAvailableCards = []; }
});

it('평일에 고정한 덱도 휴무로 바뀌면 신규 카드 대신 기존 복습을 연다', () => {
  const settings = useSettingsStore.getState();
  useSettingsStore.setState({ shuffleCards: false, prioritizeWeakSpots: false });
  mockParams = { category: mockCard.category };
  const review: LearningCard = { ...mockCard, id: 'midnight-review', status: 'learning', question: '자정 이후 복습 문제' };
  mockAvailableCards = [mockCard, review];
  useSrsStore.getState().reset();
  try {
    const view = wrap('이용재');
    expect(screen.getAllByText(mockCard.question, { exact: false }).length).toBeGreaterThan(0);
    mockRestDay = true;
    view.rerender(<SafeAreaProvider initialMetrics={metrics}><ThemeProvider><CardsScreen /></ThemeProvider></SafeAreaProvider>);
    expect(screen.getAllByText(review.question, { exact: false }).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(mockCard.question, { exact: false })).toHaveLength(0);
    expect(useSrsStore.getState().cards).toEqual({});
    view.unmount();
  } finally {
    mockRestDay = false; mockParams = {}; mockAvailableCards = [];
    useSettingsStore.setState({ shuffleCards: settings.shuffleCards, prioritizeWeakSpots: settings.prioritizeWeakSpots });
  }
});

it('할당 목록의 날짜 갱신이 늦어도 휴무로 바뀐 오늘 학습에서 복습을 연다', () => {
  const review: LearningCard = { ...mockCard, id: 'today-midnight-review', status: 'learning', question: '자정 이후 오늘 복습 문제' };
  mockAssignedCards = [mockCard, review];
  useSrsStore.getState().reset();
  try {
    const view = wrap('이용재');
    expect(screen.getAllByText(mockCard.question, { exact: false }).length).toBeGreaterThan(0);
    mockRestDay = true;
    view.rerender(<SafeAreaProvider initialMetrics={metrics}><ThemeProvider><CardsScreen /></ThemeProvider></SafeAreaProvider>);
    expect(screen.getAllByText(review.question, { exact: false }).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(mockCard.question, { exact: false })).toHaveLength(0);
    view.unmount();
  } finally { mockRestDay = false; mockAssignedCards = null; }
});

it('같은 렌더에서 두 번 탭해도 앞면으로 돌아오고 뒷면 빈 공간도 탭할 수 있다', () => {
  const type = mockCard.type;
  mockCard.type = 'explanation';
  try {
    wrap('이용재');
    const button = screen.getByLabelText('카드 뒤집기');
    act(() => { fireEvent.press(button); fireEvent.press(button); jest.advanceTimersByTime(400); });
    expect(screen.getByTestId('learning-card-front').props.pointerEvents).toBe('auto');
    act(() => { fireEvent.press(screen.getByLabelText('카드 뒤집기')); jest.advanceTimersByTime(400); });
    const stopPropagation = jest.fn();
    fireEvent.press(screen.getByTestId('learning-card-back-tap'), { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    act(() => jest.advanceTimersByTime(400));
    expect(screen.getByTestId('learning-card-front').props.pointerEvents).toBe('auto');
  } finally { mockCard.type = type; }
});

// 카드 등장 애니메이션(스프링)은 렌더가 끝난 뒤에도 계속 값을 갱신해서, 그때마다
// "not wrapped in act(...)" 경고가 쏟아진다. 이 검사는 구조만 보므로 애니메이션을
// 진행시킬 이유가 없다 — 타이머를 세워 둔 채로 첫 프레임만 본다.
beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

it('완료 버튼 연타와 화면 이탈 후 애니메이션 완료가 중복/늦은 판정을 만들지 않는다', () => {
  const type = mockCard.type;
  mockCard.type = 'explanation';
  useDiffPollStore.setState({ myVotes: { [mockCard.id]: 'easy' } });
  let callback!: (result: { finished: boolean }) => void;
  const parallel = jest.spyOn(Animated, 'parallel').mockReturnValue({
    start: (cb) => { callback = cb!; }, stop: jest.fn(), reset: jest.fn(),
  });
  try {
    const view = wrap('이용재');
    fireEvent.press(screen.getByLabelText('카드 뒤집기'));
    act(() => jest.advanceTimersByTime(400));
    fireEvent.press(screen.getByText('알고 있어요'));
    fireEvent.press(screen.getByText('알고 있어요'));
    // A previous difficulty vote must not skip this event's reflection input.
    fireEvent.press(screen.getByLabelText('난이도 쉬움 — 바로 알았어요'));
    expect(parallel).toHaveBeenCalledTimes(1);
    view.unmount();
    act(() => callback({ finished: true }));
    expect(mockMark).not.toHaveBeenCalled();
  } finally {
    parallel.mockRestore();
    mockCard.type = type;
  }
});

describe.each([
  ['클래식 트랙', '이용재'],
  ['스와이프 트랙', '원진섭'],
])('학습 카드 화면(%s) — 조작 요소 구조', (_label, name) => {
  it('카드가 실제로 그려진다(빈 화면으로 통과하는 헛검사 방지)', () => {
    wrap(name);
    // 앞면의 문제와 보기는 카드가 그려졌을 때만 존재한다.
    // (좋아요·저장·신고는 카드 뒷면에 있다.)
    expect(screen.getByText(mockCard.situation!)).toBeTruthy();
    expect(screen.getByText(mockCard.choices![0])).toBeTruthy();
  });

  it('버튼 안에 버튼이 없다', () => {
    wrap(name);
    expect(nested()).toEqual([]);
  });

  it("'뒤집기'는 이름을 가진 버튼으로 닿을 수 있다", () => {
    wrap(name);
    // 클래식은 하단 '카드 뒤집기' 버튼의 글자, 스와이프는 안내 줄의 접근성 이름.
    const byName =
      screen.queryAllByText('카드 뒤집기').length + screen.queryAllByLabelText('카드 뒤집기').length;
    expect(byName).toBeGreaterThan(0);
  });
});
