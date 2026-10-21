import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { QuizExamplePlayer } from '../QuizExamplePlayer';
import { QUIZ_EXAMPLES } from '../examples';

const [multiple, ordering, matching] = QUIZ_EXAMPLES;

it('복수정답 전체를 제출하고 잠근 뒤 처음부터 다시 푼다', () => {
  const view = render(<QuizExamplePlayer quiz={multiple} />);
  expect(view.getByRole('button', { name: '정답 확인', disabled: true })).toBeTruthy();
  expect(view.queryByTestId('quiz-example-feedback')).toBeNull();
  for (const name of ['가연물', '산소', '점화원']) fireEvent.press(view.getByRole('checkbox', { name }));
  fireEvent.press(view.getByRole('button', { name: '정답 확인' }));
  expect(view.getByText('정답입니다!')).toBeTruthy();
  expect(view.getAllByRole('checkbox', { disabled: true })).toHaveLength(5);
  expect(view.getByRole('button', { name: '처음부터 풀기', disabled: false })).toBeTruthy();
  fireEvent.press(view.getByRole('button', { name: '처음부터 풀기' }));
  expect(view.queryByTestId('quiz-example-feedback')).toBeNull();
  expect(view.getAllByRole('checkbox', { checked: false })).toHaveLength(5);
  expect(view.getByRole('button', { name: '정답 확인', disabled: true })).toBeTruthy();
});

it.each([['가연물', '산소'], ['가연물', '산소', '점화원', '수분']])('복수정답의 누락과 추가 선택은 오답이다: %j', (...names) => {
  const view = render(<QuizExamplePlayer quiz={multiple} />);
  for (const name of names) fireEvent.press(view.getByRole('checkbox', { name }));
  fireEvent.press(view.getByRole('button', { name: '정답 확인' }));
  expect(view.getByText('다시 확인해 보세요.')).toBeTruthy();
});

it('선택한 순서를 취소/수정하며 모든 항목을 고른 뒤 제출한다', () => {
  const view = render(<QuizExamplePlayer quiz={ordering} />);
  fireEvent.press(view.getByRole('button', { name: '보고서 저장' }));
  expect(view.getByRole('button', { name: '정답 확인', disabled: true })).toBeTruthy();
  fireEvent.press(view.getByRole('button', { name: '1번 보고서 저장 선택 취소' }));
  for (const name of ['점검 결과 입력', '입력 내용 확인', '보고서 저장']) fireEvent.press(view.getByLabelText(name));
  fireEvent.press(view.getByRole('button', { name: '정답 확인' }));
  expect(view.getByText('정답입니다!')).toBeTruthy();
  expect(view.getByRole('button', { name: '1번 점검 결과 입력 선택 취소', disabled: true })).toBeTruthy();
});

it('순서가 틀리면 해설을 보여 준다', () => {
  const view = render(<QuizExamplePlayer quiz={ordering} />);
  for (const name of ['보고서 저장', '점검 결과 입력', '입력 내용 확인']) fireEvent.press(view.getByLabelText(name));
  fireEvent.press(view.getByRole('button', { name: '정답 확인' }));
  expect(view.getByText('다시 확인해 보세요.')).toBeTruthy();
});

it('연결을 자동으로 다음 용어로 옮기고 세 쌍을 채점한다', () => {
  const view = render(<QuizExamplePlayer quiz={matching} />);
  expect(view.getByRole('button', { name: '정답 확인', disabled: true })).toBeTruthy();
  for (const name of ['연소할 수 있는 물질', '연소를 돕는 기체', '발화에 필요한 에너지']) fireEvent.press(view.getByLabelText(name));
  expect(view.getByText('3 / 3쌍 연결')).toBeTruthy();
  fireEvent.press(view.getByRole('button', { name: '정답 확인' }));
  expect(view.getByText('정답입니다!')).toBeTruthy();
  expect(view.getByRole('button', { name: '가연물', disabled: true })).toBeTruthy();
});

it('연결 대상을 재사용하면 이전 짝을 해제하고 미완성 제출을 막는다', () => {
  const view = render(<QuizExamplePlayer quiz={matching} />);
  fireEvent.press(view.getByLabelText('연소할 수 있는 물질'));
  fireEvent.press(view.getByLabelText('연소할 수 있는 물질'));
  expect(view.getByText('1 / 3쌍 연결')).toBeTruthy();
  expect(view.getByRole('button', { name: '정답 확인', disabled: true })).toBeTruthy();
  fireEvent.press(view.getByRole('button', { name: '처음부터 풀기' }));
  expect(view.getByText('0 / 3쌍 연결')).toBeTruthy();
});
