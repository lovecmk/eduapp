import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { CardQuiz } from '../CardQuiz';
import { CardMapper } from '../../../data/mappers/CardMapper';
import type { CardDTO } from '../../../data/dto/CardDTO';

it.each(['현장판단형', '선택비교형'])('%s preserves server choices, grades and locks the selection', format => {
  const choices = format === '현장판단형' ? ['보류', '정답 조치', '다른 조치'] : ['첫 설명', '정답 조치'];
  const card = CardMapper.toDomain({ id: 'test', category_cd: 'ELEC', format_nm: format, card_type_cd: 'CHOICE', situation_txt: '현장을 확인합니다.', question_txt: '적절한 답은?', choices, answer_index: 1, answer_txt: '정답 조치', status_cd: 'NEW', due_at: null });
  expect(card.type).toBe('choice');
  const pick = jest.fn();
  const view = render(<CardQuiz card={card} pick={null} revealed={false} onPick={pick} />);
  expect(view.getAllByRole('button')).toHaveLength(choices.length);
  fireEvent.press(view.getByText('정답 조치'));
  expect(pick).toHaveBeenCalledWith(1);
  view.rerender(<CardQuiz card={card} pick={1} revealed onPick={pick} />);
  expect(view.getByText('정답이에요! 🎉')).toBeTruthy();
  expect(view.getAllByRole('button', { disabled: true })).toHaveLength(choices.length);
  view.rerender(<CardQuiz card={card} pick={0} revealed onPick={pick} />);
  expect(view.getByText(`아쉬워요 — 정답은 ${format === '선택비교형' ? 'B' : '(2)'}`)).toBeTruthy();
});

it.each([
  { choices: ['보류', '정답'] }, { choices: ['정답', '정답', '다른 조치'] }, { choices: [' ', '정답', '다른 조치'] },
  { answer_index: 0 }, { answer_txt: '보기 밖' }, { situation_txt: '' }, { question_txt: '' },
])('malformed new quizzes never create incorrect grades: %p', invalid => {
  const card = CardMapper.toDomain({ id: 'test', category_cd: 'ELEC', format_nm: '현장판단형', card_type_cd: 'CHOICE', situation_txt: '현장을 확인합니다.', question_txt: '적절한 답은?', choices: ['보류', '정답', '다른 조치'], answer_index: 1, answer_txt: '정답', status_cd: 'NEW', due_at: null, ...invalid } as CardDTO);
  expect(card.type).toBe('explanation');
  expect(card.answerIndex).toBeUndefined();
});
