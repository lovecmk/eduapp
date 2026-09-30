// 고객센터 문의 — 서버가 받았을 때만 '접수되었어요'라고 말하는가.
//
// 과거 결함: 저장소 없이 0.9초를 기다린 뒤 "문의가 접수되었어요 · 24시간 이내 답변"을
// 띄웠다. 문의는 아무 데도 가지 않았고, 법적 고지는 이 창을 1차 문의 창구로 안내했다.

const mockSubmit = jest.fn();
jest.mock('../../../data/repositories', () => ({
  supportRepository: { submit: (...a: unknown[]) => mockSubmit(...a) },
}));

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SupportModal } from '../SupportModal';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import { ApiError } from '../../../data/network/errors';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const wrap = () =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>
        <SupportModal visible onClose={() => {}} defaultEmail="won@example.com" />
      </ThemeProvider>
    </SafeAreaProvider>,
  );

const fillAndSend = () => {
  fireEvent.changeText(screen.getByPlaceholderText('문제 상황을 자세히 적어주세요 (최소 10자)'), '학습 화면에서 사진이 계속 안 보입니다.');
  fireEvent.press(screen.getByText('문의 보내기'));
};

beforeEach(() => mockSubmit.mockReset());

describe('SupportModal', () => {
  it('서버가 받으면 접수 완료와 접수 번호를 보인다', async () => {
    mockSubmit.mockResolvedValue({ id: 'Q-42' });
    wrap();
    fillAndSend();
    await waitFor(() => expect(screen.getByText('문의가 접수되었어요')).toBeTruthy());
    expect(screen.getByText('접수 번호 Q-42')).toBeTruthy();
    expect(mockSubmit).toHaveBeenCalledWith(expect.objectContaining({ email: 'won@example.com' }));
  });

  it('창구(라우트)가 없으면 접수됐다고 하지 않고, 적은 내용을 남긴다', async () => {
    mockSubmit.mockRejectedValue(new ApiError(404, ''));
    wrap();
    fillAndSend();
    await waitFor(() => expect(screen.getByText(/창구가 아직 열리지 않았어요/)).toBeTruthy());
    expect(screen.queryByText('문의가 접수되었어요')).toBeNull();
    expect(screen.getByDisplayValue('학습 화면에서 사진이 계속 안 보입니다.')).toBeTruthy();
  });

  it('연결이 없으면 다시 보낼 수 있게 한다', async () => {
    mockSubmit.mockRejectedValue(new ApiError(0, '', 'offline'));
    wrap();
    fillAndSend();
    await waitFor(() => expect(screen.getByText('다시 보내기')).toBeTruthy());
    expect(screen.queryByText('문의가 접수되었어요')).toBeNull();
  });
});
