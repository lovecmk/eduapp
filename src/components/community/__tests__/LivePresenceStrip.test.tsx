import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { LivePresenceStrip } from '../LivePresenceStrip';
import { ROUTES } from '../../../constants/routes';

const mockPush = jest.fn();
const mockUseCommunity = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../../../hooks/useCommunity', () => ({ useCommunity: () => mockUseCommunity() }));

it.each([[1, '1'], [1234, '1,234']])('접속자 대신 오늘 실제 학습자 %i명을 표시한다', (count, formatted) => {
  mockUseCommunity.mockReturnValue({ data: { onlineNow: 99, studiedToday: count } });
  render(<LivePresenceStrip />);
  expect(screen.getByText(`오늘 ${formatted}명이 학습을 완료했어요`)).toBeTruthy();
  expect(screen.queryByText(/명 학습 중/)).toBeNull();
});

it('아직 학습자가 없으면 0명 대신 첫 학습을 권한다', () => {
  mockUseCommunity.mockReturnValue({ data: { onlineNow: 99, studiedToday: 0 } });
  render(<LivePresenceStrip />);
  expect(screen.getByText('오늘의 첫 학습을 완료해 보세요')).toBeTruthy();
  expect(screen.queryByText(/0명/)).toBeNull();
});

it('집계를 불러오기 전이나 실패했을 때는 인원을 만들어 표시하지 않는다', () => {
  mockUseCommunity.mockReturnValue({ data: undefined, isLoading: true });
  const view = render(<LivePresenceStrip />);
  expect(view.toJSON()).toBeNull();
  mockUseCommunity.mockReturnValue({ data: undefined, isError: true });
  view.rerender(<LivePresenceStrip />);
  expect(view.toJSON()).toBeNull();
});

it('오늘 학습 인원을 누르면 커뮤니티로 이동한다', () => {
  mockUseCommunity.mockReturnValue({ data: { studiedToday: 3 } });
  render(<LivePresenceStrip />);
  fireEvent.press(screen.getByLabelText('오늘 3명이 학습을 완료했어요'));
  expect(mockPush).toHaveBeenCalledWith(ROUTES.community);
});
