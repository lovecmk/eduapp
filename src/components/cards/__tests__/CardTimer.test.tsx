import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { CardTimer } from '../CardTimer';

const originalState = AppState.currentState;
let foreground: (state: AppStateStatus) => void;
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-26T03:00:00Z'));
  AppState.currentState = 'active';
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
    foreground = handler;
    return { remove: jest.fn() };
  });
});
afterEach(() => { AppState.currentState = originalState; jest.restoreAllMocks(); jest.useRealTimers(); });

it('pauses in the background, resumes the remaining time and signals expiration only once', () => {
  const expire = jest.fn();
  const view = render(<CardTimer seconds={10} resetKey="a" onExpire={expire} />);
  act(() => { jest.advanceTimersByTime(6000); });
  expect(view.getByLabelText('생각할 시간 4초 남음')).toBeTruthy();
  act(() => { foreground('background'); jest.advanceTimersByTime(60000); });
  expect(view.getByLabelText('생각할 시간 4초 남음')).toBeTruthy();
  expect(expire).not.toHaveBeenCalled();
  act(() => { foreground('active'); jest.advanceTimersByTime(4000); });
  expect(view.getByLabelText('생각할 시간 종료, 준비 완료')).toBeTruthy();
  act(() => { jest.advanceTimersByTime(60000); foreground('active'); });
  expect(expire).toHaveBeenCalledTimes(1);
});

it('resets for the next card and cancels the previous expiry callback', () => {
  const first = jest.fn(), second = jest.fn();
  const view = render(<CardTimer seconds={10} resetKey="a" onExpire={first} />);
  act(() => { jest.advanceTimersByTime(8000); });
  view.rerender(<CardTimer seconds={20} resetKey="b" onExpire={second} />);
  expect(view.getByLabelText('생각할 시간 20초 남음')).toBeTruthy();
  act(() => { jest.advanceTimersByTime(3000); });
  expect(view.getByLabelText('생각할 시간 17초 남음')).toBeTruthy();
  expect(first).not.toHaveBeenCalled();
  view.unmount();
  act(() => { jest.advanceTimersByTime(30000); });
  expect(second).not.toHaveBeenCalled();
});

it('does not consume thinking time when mounted while the app is inactive', () => {
  AppState.currentState = 'background';
  const expire = jest.fn();
  const view = render(<CardTimer seconds={5} resetKey="a" onExpire={expire} />);
  act(() => { jest.advanceTimersByTime(30000); });
  expect(view.getByLabelText('생각할 시간 5초 남음')).toBeTruthy();
  expect(expire).not.toHaveBeenCalled();
  act(() => { foreground('active'); jest.advanceTimersByTime(5000); });
  expect(expire).toHaveBeenCalledTimes(1);
});
