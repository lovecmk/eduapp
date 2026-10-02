import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AvailabilityField } from '../AvailabilityField';
import { ThemeProvider } from '../../../theme/ThemeProvider';

it('입력이 바뀐 뒤 오는 중복확인 응답은 새 값을 승인하지 않는다', async () => {
  let finish!: (taken: boolean) => void;
  const checkTaken = jest.fn(() => new Promise<boolean>((resolve) => { finish = resolve; }));
  const onState = jest.fn();
  function Form() {
    const [value, setValue] = useState('old-value');
    return <ThemeProvider><AvailabilityField label="닉네임" value={value} onChangeText={setValue} validate={() => null} checkTaken={checkTaken} onStateChange={onState} /></ThemeProvider>;
  }
  render(<Form />);
  fireEvent.press(screen.getByText('중복확인'));
  fireEvent.changeText(screen.getByLabelText('닉네임'), 'new-value');
  await act(async () => { finish(false); });
  expect(screen.queryByText('사용 가능합니다')).toBeNull();
  expect(onState).not.toHaveBeenCalledWith('available');
  fireEvent.press(screen.getByText('중복확인'));
  await act(async () => { finish(false); });
  expect(screen.getByText('사용 가능합니다')).toBeTruthy();
  expect(checkTaken).toHaveBeenLastCalledWith('new-value');
});
