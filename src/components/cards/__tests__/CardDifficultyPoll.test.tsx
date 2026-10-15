import React from 'react';
import { render } from '@testing-library/react-native';
import { CardDifficultyPoll } from '../CardDifficultyPoll';
import { useDifficultyPoll } from '../../../hooks/useDifficultyPoll';
import { useSrsStore } from '../../../store/srsStore';
import { initialState } from '../../../domain/srs';

jest.mock('../../../hooks/useDifficultyPoll', () => ({ useDifficultyPoll: jest.fn() }));
const poll = useDifficultyPoll as jest.MockedFunction<typeof useDifficultyPoll>;
beforeEach(() => useSrsStore.setState({ cards: {} }));

it('복습 난이도는 기존 선택과 실제 분포를 보여주며 입력 버튼이 없다', () => {
  poll.mockReturnValue({ mine: 'hard', counts: { easy: 1, normal: 2, hard: 7 }, loaded: true });
  const view = render(<CardDifficultyPoll cardId="a" />);
  expect(view.getByLabelText('어려웠어요 · 내 선택')).toBeTruthy();
  expect(view.getByText('10명 참여')).toBeTruthy();
  expect(view.getByText('내 선택 · 변경할 수 없어요')).toBeTruthy();
  expect(view.queryAllByRole('button')).toHaveLength(0);
});

it('카드를 바꾸면 그 카드의 저장된 난이도를 표시하고 없는 기록은 추측하지 않는다', () => {
  poll.mockReturnValue({ mine: 'hard', counts: null, loaded: true });
  const view = render(<CardDifficultyPoll cardId="a" />);
  poll.mockReturnValue({ mine: 'easy', counts: null, loaded: true });
  view.rerender(<CardDifficultyPoll cardId="b" />);
  expect(view.queryByLabelText('어려웠어요 · 내 선택')).toBeNull();
  expect(view.getByLabelText('쉬웠어요 · 내 선택')).toBeTruthy();
  poll.mockReturnValue({ mine: null, counts: null, loaded: true });
  view.rerender(<CardDifficultyPoll cardId="c" />);
  expect(view.queryByText('내 선택')).toBeNull();
  expect(view.getByText('아직 난이도 선택 기록이 없어요')).toBeTruthy();
  expect(view.queryAllByRole('button')).toHaveLength(0);
});

it.each([
  ['again', 'good', '다음에 한번 더 볼게요', '안 볼게요'],
  ['good', 'again', '안 볼게요', '다음에 한번 더 볼게요'],
] as const)('처음 선택 %s는 마지막 선택 %s와 달라도 난이도 카드 안에 변경 불가로 표시한다', (firstGrade, lastGrade, selected, other) => {
  poll.mockReturnValue({ mine: 'hard', counts: null, loaded: true });
  useSrsStore.setState({ cards: { a: { ...initialState(1), reps: 2, firstGrade, firstReviewedAt: 1, lastGrade, lastReviewedAt: 2 } } });
  const before = useSrsStore.getState().cards.a;
  const view = render(<CardDifficultyPoll cardId="a" />);
  const record = view.getByTestId('review-difficulty').findByProps({ testID: 'recorded-review-choice' });
  expect(record).toBeTruthy();
  expect(view.getByLabelText(`${selected} · 처음 선택`).props.accessibilityState).toEqual({ disabled: true, selected: true });
  expect(view.getByLabelText(other).props.accessibilityState).toEqual({ disabled: true, selected: false });
  expect(view.queryAllByRole('button')).toHaveLength(0);
  expect(useSrsStore.getState().cards.a).toEqual(before);
});

it('여러 번 학습한 카드의 최초 기록이 없으면 마지막 선택을 대신 강조하지 않는다', () => {
  poll.mockReturnValue({ mine: null, counts: null, loaded: true });
  useSrsStore.setState({ cards: { a: { ...initialState(1), reps: 2, lastGrade: 'good', lastReviewedAt: 2 } } });
  const view = render(<CardDifficultyPoll cardId="a" />);
  expect(view.getByText('이 카드의 최초 선택 기록을 확인할 수 없어요.')).toBeTruthy();
  expect(view.getByLabelText('안 볼게요').props.accessibilityState).toEqual({ disabled: true, selected: false });
  expect(view.getByLabelText('다음에 한번 더 볼게요').props.accessibilityState).toEqual({ disabled: true, selected: false });
});

it('카드 안에서 처음 선택한 답변이 체감 난이도보다 위에 온다', () => {
  poll.mockReturnValue({ mine: 'easy', counts: null, loaded: true });
  const view = render(<CardDifficultyPoll cardId="a" />);
  const order = view.getAllByRole('header').map((h) => h.props.children);
  expect(order).toEqual(['처음 선택한 답변', '체감 난이도']);
});
