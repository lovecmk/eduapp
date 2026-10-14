import 'react-native-gesture-handler/jestSetup';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Modal } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import type { TapGesture, PanGesture, PinchGesture } from 'react-native-gesture-handler';
import { ImageViewer } from '../ImageViewer';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (onClose: () => void) => render(<SafeAreaProvider initialMetrics={metrics}>
  <ImageViewer source={{ uri: 'https://example.test/image.png' }} onClose={onClose} />
</SafeAreaProvider>);

it.each([[195, 420], [8, 8]])('one tap at %i,%i closes the image or backdrop', (x, y) => {
  const close = jest.fn(); wrap(close);
  act(() => fireGestureHandler<TapGesture>(getByGestureTestId('image-viewer-tap'), [{ x, y }]));
  act(() => jest.advanceTimersByTime(20));
  expect(close).toHaveBeenCalledTimes(1);
});

it('failed tap, pan and pinch do not close the viewer', () => {
  const close = jest.fn(); wrap(close);
  act(() => {
    fireGestureHandler<TapGesture>(getByGestureTestId('image-viewer-tap'), [{ state: State.BEGAN }, { state: State.FAILED }]);
    fireGestureHandler<PinchGesture>(getByGestureTestId('image-viewer-pinch'), [{ scale: 1 }, { scale: 2 }]);
    fireGestureHandler<PanGesture>(getByGestureTestId('image-viewer-pan'), [{ translationX: 0 }, { translationX: 80, translationY: 30 }]);
  });
  expect(close).not.toHaveBeenCalled();
  act(() => fireGestureHandler<TapGesture>(getByGestureTestId('image-viewer-tap')));
  act(() => jest.advanceTimersByTime(20));
  expect(close).toHaveBeenCalledTimes(1);
});

it('the close button and Android modal back action still close', () => {
  const close = jest.fn(); wrap(close);
  const stopPropagation = jest.fn();
  fireEvent.press(screen.getByLabelText('확대 보기 닫기'), { stopPropagation });
  expect(stopPropagation).toHaveBeenCalledTimes(1);
  fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose');
  expect(close).toHaveBeenCalledTimes(2);
});
