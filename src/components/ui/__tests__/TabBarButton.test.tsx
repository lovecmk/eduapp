import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Text, Pressable } from 'react-native';
import { TabBarButton } from '../TabBarButton';

it('keeps the navigator selected state and tab accessibility when switching tabs', () => {
  const press = jest.fn();
  const view = render(<TabBarButton aria-selected aria-label="복습" onPress={press}><Text>복습</Text></TabBarButton>);
  expect(view.getByRole('tab', { selected: true }).props.accessibilityLabel).toBe('복습');
  expect(view.UNSAFE_getByType(Pressable).props['aria-selected']).toBe(true);
  fireEvent.press(view.getByRole('tab'));
  expect(press).toHaveBeenCalledTimes(1);
  view.rerender(<TabBarButton aria-selected={false}><Text>복습</Text></TabBarButton>);
  expect(view.getByRole('tab', { selected: false })).toBeTruthy();
  expect(view.UNSAFE_getByType(Pressable).props['aria-selected']).toBe(false);
});
