import React from 'react';
import { render } from '@testing-library/react-native';
import { CardDifficultyPoll } from '../CardDifficultyPoll';
import { useDifficultyPoll } from '../../../hooks/useDifficultyPoll';

jest.mock('../../../hooks/useDifficultyPoll', () => ({ useDifficultyPoll: jest.fn() }));
const poll = useDifficultyPoll as jest.MockedFunction<typeof useDifficultyPoll>;

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
