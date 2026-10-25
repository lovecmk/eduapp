import React from 'react';
import { render } from '@testing-library/react-native';
import { CardFrontBody } from '../CardFrontBody';
import { CardMapper } from '../../../data/mappers/CardMapper';

const dto = { id: 'choice', category_cd: 'ELEC', card_type_cd: 'CHOICE' as const, format_nm: '객관식',
  question_txt: '가장 먼저 할 일은?', choices: ['전원을 차단한다', '물을 뿌린다', '기다린다'],
  status_cd: 'NEW' as const, due_at: null };

it('shows numbered choices beneath the question in read-only detail', () => {
  const card = CardMapper.toDomain({ ...dto, answer_index: 0 });
  const view = render(<CardFrontBody card={card} />);
  expect(view.getByText('(1)')).toBeTruthy();
  expect(view.getByText('(2)')).toBeTruthy();
  expect(view.getByText('(3)')).toBeTruthy();
  dto.choices.forEach(choice => expect(view.getByText(choice)).toBeTruthy());
  expect(view.queryAllByRole('button')).toHaveLength(0);
  const text = JSON.stringify(view.toJSON());
  expect(text.indexOf(dto.question_txt)).toBeLessThan(text.indexOf(dto.choices[0]));
});

it('retains choices without inventing a grade when the answer index is missing', () => {
  const card = CardMapper.toDomain(dto);
  expect(card.type).toBe('explanation');
  expect(card.answerIndex).toBeUndefined();
  const view = render(<CardFrontBody card={card} />);
  dto.choices.forEach(choice => expect(view.getByText(choice)).toBeTruthy());
});

it('shows choices from an older explanation response that declares an objective format', () => {
  const card = CardMapper.toDomain({ ...dto, card_type_cd: 'EXPLANATION' });
  expect(card.type).toBe('explanation');
  expect(card.answerIndex).toBeUndefined();
  const view = render(<CardFrontBody card={card} />);
  dto.choices.forEach(choice => expect(view.getByText(choice)).toBeTruthy());
});

it('does not duplicate choices when the learning screen supplies interactive quiz buttons', () => {
  const card = CardMapper.toDomain({ ...dto, answer_index: 0 });
  const view = render(<CardFrontBody card={card} showChoices={false} />);
  expect(view.getByText(dto.question_txt)).toBeTruthy();
  expect(view.queryByText(dto.choices[0])).toBeNull();
});
