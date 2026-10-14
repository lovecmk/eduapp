const mockSubmit = jest.fn();
const mockRecord = jest.fn();
jest.mock('../../../data/repositories', () => ({ reportRepository: { submit: (...args: unknown[]) => mockSubmit(...args) } }));
jest.mock('../../../store/authStore', () => ({ useAuthStore: { getState: () => ({ user: { id: 'actor' } }) } }));
jest.mock('../../../store/reportStore', () => ({
  useReportStore: (select: (s: unknown) => unknown) => select({ submit: mockRecord }),
  REPORT_REASON_LABEL: { wrong_answer: '정답 오류', typo: '오탈자' },
}));

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import { CardReportModal } from '../CardReportModal';
import type { LearningCard } from '../../../domain/models/LearningCard';

function open() {
  return render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, bottom: 0, left: 0, right: 0 } }}><ThemeProvider><CardReportModal visible card={{ id: 'c1', question: '질문' } as LearningCard} onClose={() => {}} /></ThemeProvider></SafeAreaProvider>);
}

beforeEach(() => { mockSubmit.mockReset(); mockRecord.mockReset(); });

it.each(['sent', 'queued'])('records %s only after durable submission and gives accurate feedback', async result => {
  let complete!: (value: string) => void;
  mockSubmit.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  open();
  fireEvent.press(screen.getByText('신고 보내기'));
  expect(mockRecord).not.toHaveBeenCalled();
  complete(result);
  await waitFor(() => expect(screen.getByText(result === 'sent' ? '신고가 접수되었어요' : '신고를 기기에 저장했어요')).toBeTruthy());
  expect(mockRecord).toHaveBeenCalledTimes(1);
});

it('keeps a rejected report editable and retryable', async () => {
  mockSubmit.mockRejectedValueOnce(new Error('forbidden')).mockResolvedValueOnce('sent');
  open();
  fireEvent.press(screen.getByText('신고 보내기'));
  await waitFor(() => expect(screen.getByText('신고를 보내지 못했습니다. 다시 시도해주세요.')).toBeTruthy());
  expect(mockRecord).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('신고 보내기'));
  await waitFor(() => expect(screen.getByText('신고가 접수되었어요')).toBeTruthy());
  expect(mockRecord).toHaveBeenCalledTimes(1);
});
