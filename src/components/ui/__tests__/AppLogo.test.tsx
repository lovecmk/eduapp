import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppLogo } from '../AppLogo';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import { useSettingsStore } from '../../../store/settingsStore';

it('keeps the bundled number 3 logo in a fixed header slot', () => {
  render(<AppLogo size={30} testID="logo" />);
  expect(screen.getByTestId('logo').props.style).toMatchObject({ width: 30, height: 30, flexShrink: 0 });
  expect(screen.getByTestId('logo-image').props.source).toBe(require('../../../../assets/icon.png'));
});

it('keeps a visible number 3 when the bundled image cannot be decoded', () => {
  render(<AppLogo size={30} testID="logo" />);
  fireEvent(screen.getByTestId('logo-image'), 'error', { nativeEvent: { error: 'decode failed' } });
  expect(screen.getByText('3')).toBeTruthy();
  expect(screen.queryByTestId('logo-image')).toBeNull();
  expect(screen.getByTestId('logo').props.style).toMatchObject({ width: 30, height: 30 });
});

it('tries the next mode logo after a decode failure and restores the light logo after loading', async () => {
  useSettingsStore.getState().setThemeMode('light');
  render(<ThemeProvider><AppLogo size={30} testID="logo" /></ThemeProvider>);
  fireEvent(screen.getByTestId('logo-image'), 'error', { nativeEvent: { error: 'decode failed' } });
  expect(screen.getByText('3')).toBeTruthy();
  await act(async () => { useSettingsStore.getState().setThemeMode('dark'); });
  expect(screen.getByTestId('logo-image')).toBeTruthy();
  fireEvent(screen.getByTestId('logo-image'), 'load');
  await act(async () => { useSettingsStore.getState().setThemeMode('light'); });
  expect(screen.getByTestId('logo-image')).toBeTruthy();
  expect(screen.queryByText('3')).toBeNull();
});
