import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { CardQuiz } from '../CardQuiz';
import { CardMapper } from '../../../data/mappers/CardMapper';

it('서버 빈칸형을 두 보기와 정답 그대로 표시하고 선택 후 잠근다', () => {
  const card = CardMapper.toDomain({ id: 'blank', category_cd: 'ELEC', format_nm: '빈칸형', card_type_cd: 'CHOICE',
    question_txt: '화재의 3요소는 가연물, 산소, [빈칸]입니다.', choices: ['점화원', '질소'], answer_index: 0,
    answer_txt: '점화원', principle_txt: '점화원이 필요합니다.', status_cd: 'NEW', due_at: null });
  expect(card.format).toBe('빈칸형');
  expect(card.type).toBe('choice');
  expect(card.answerIndex).toBe(0);
  const pick = jest.fn();
  const view = render(<CardQuiz card={card} pick={null} revealed={false} onPick={pick} />);
  expect(view.getAllByRole('button')).toHaveLength(2);
  fireEvent.press(view.getByText('질소'));
  expect(pick).toHaveBeenCalledWith(1);
  view.rerender(<CardQuiz card={card} pick={1} revealed onPick={pick} />);
  expect(view.getByText('아쉬워요 — 정답은 (1)')).toBeTruthy();
  expect(view.getAllByRole('button', { disabled: true })).toHaveLength(2);
  view.rerender(<CardQuiz card={card} pick={0} revealed onPick={pick} />);
  expect(view.getByText('정답이에요! 🎉')).toBeTruthy();
});
