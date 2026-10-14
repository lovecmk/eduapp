import { act, renderHook } from '@testing-library/react-native';
import { Animated } from 'react-native';
import { useCardFlip } from '../useCardFlip';

beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

it.each([2, 3, 8, 9])('%i taps before a render preserve every toggle', count => {
  const animations: { target: number; finish?: (result: { finished: boolean }) => void }[] = [];
  jest.spyOn(Animated, 'timing').mockImplementation((_value, config) => {
    const animation = { target: config.toValue as number, finish: undefined as ((result: { finished: boolean }) => void) | undefined };
    animations.push(animation);
    return { start: cb => { animation.finish = cb; }, stop: jest.fn(), reset: jest.fn() };
  });
  const { result } = renderHook(() => useCardFlip('card-1'));
  act(() => { for (let i = 0; i < count; i++) result.current.toggle(); });
  expect(result.current.flipped).toBe(count % 2 === 1);
  expect(result.current.target.current).toBe(count % 2 === 1);
  expect(animations.map(a => a.target)).toEqual(Array.from({ length: count }, (_, i) => (i + 1) % 2));
  // Simulate old animations completing late and in reverse order.
  act(() => { [...animations].reverse().forEach(a => a.finish?.({ finished: true })); jest.advanceTimersByTime(400); });
  expect(result.current.backControls).toBe(count % 2 === 1);
});

it('a new card cancels the previous flip and stale callbacks', () => {
  let finish: ((result: { finished: boolean }) => void) | undefined;
  jest.spyOn(Animated, 'timing').mockReturnValue({ start: cb => { finish = cb; }, stop: jest.fn(), reset: jest.fn() });
  const { result, rerender } = renderHook(({ id }) => useCardFlip(id), { initialProps: { id: 'one' } });
  act(() => { result.current.toggle(); });
  rerender({ id: 'two' });
  act(() => { finish?.({ finished: true }); jest.advanceTimersByTime(500); });
  expect(result.current.flipped).toBe(false);
  expect(result.current.backControls).toBe(false);
  expect(result.current.target.current).toBe(false);
});

it('unmount cancels animation and pending controls without a late update', () => {
  jest.spyOn(Animated, 'timing').mockReturnValue({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() });
  const { result, unmount } = renderHook(() => useCardFlip('one'));
  const stop = jest.spyOn(result.current.progress, 'stopAnimation');
  act(() => { result.current.toggle(); });
  unmount();
  expect(stop).toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});
