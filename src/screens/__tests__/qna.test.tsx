const mockMutate = jest.fn();
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: 'q1' }) }));
jest.mock('../../components/ui/ScreenHeader', () => ({ ScreenHeader: () => null }));
jest.mock('../../components/community/QnaOfflineNotice', () => ({ QnaOfflineNotice: () => null }));
jest.mock('../../hooks/useQna', () => ({
  cleanAnswerBody: (value: string) => value.trim() || null,
  useQuestion: () => ({ data: { id: 'q1', title: '질문', body: '내용', author: 'QA', createdAt: Date.now(), answers: [], likes: 0 }, isLoading: false }),
  useAnswerQuestion: () => ({ mutate: mockMutate, isPending: false }),
  useQuestionLike: () => ({ mutate: jest.fn() }),
  useAnswerLike: () => ({ mutate: jest.fn() }),
}));
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import QnaScreen from '../../../app/qna/[id]';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { useToastStore } from '../../store/toastStore';

beforeEach(() => mockMutate.mockReset());
it('답변 전송 실패 시 내용을 보존하고 재시도를 안내한다', async () => {
  render(<ThemeProvider><QnaScreen /></ThemeProvider>);
  const input = screen.getByLabelText('답변 입력');
  fireEvent.changeText(input, '작성한 안전 점검 답변');
  fireEvent.press(screen.getByLabelText('답변 보내기'));
  expect(input.props.value).toBe('작성한 안전 점검 답변');
  await act(async () => mockMutate.mock.calls[0][1].onError(new Error('전송 실패')));
  expect(input.props.value).toBe('작성한 안전 점검 답변');
  expect(useToastStore.getState().message).toContain('다시 보내');
});
it('성공을 기다리는 사이 새로 작성한 내용을 지우지 않는다', async () => {
  render(<ThemeProvider><QnaScreen /></ThemeProvider>);
  const input = screen.getByLabelText('답변 입력');
  fireEvent.changeText(input, '첫 답변');
  fireEvent.press(screen.getByLabelText('답변 보내기'));
  fireEvent.changeText(input, '다음 답변');
  await act(async () => mockMutate.mock.calls[0][1].onSuccess());
  expect(input.props.value).toBe('다음 답변');
});
