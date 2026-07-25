import React from 'react';
import { render } from '@testing-library/react-native';
import { AttendanceStamp } from '../AttendanceStamp';
import { CheckInSuccess } from '../CheckInSuccess';
import { Text } from 'react-native';

describe('AttendanceStamp', () => {
  it('정적(과거 출석)으로 렌더해도 크래시하지 않는다', () => {
    expect(() => render(<AttendanceStamp />)).not.toThrow();
  });

  it('방금 찍은 경우 애니메이션 모드로 렌더된다', () => {
    expect(() => render(<AttendanceStamp animate />)).not.toThrow();
  });

  it('언마운트 시 애니메이션을 정리한다(경고 없이 종료)', () => {
    const view = render(<AttendanceStamp animate />);
    expect(() => view.unmount()).not.toThrow();
  });
});

describe('CheckInSuccess', () => {
  it('자식을 그대로 보여준다', () => {
    const { getByText } = render(
      <CheckInSuccess>
        <Text>오늘 출석 완료!</Text>
      </CheckInSuccess>,
    );
    expect(getByText('오늘 출석 완료!')).toBeTruthy();
  });

  it('animate 여부와 무관하게 내용이 보인다(애니메이션이 콘텐츠를 가리지 않음)', () => {
    const { getByText } = render(
      <CheckInSuccess animate>
        <Text>오늘 출석 완료!</Text>
      </CheckInSuccess>,
    );
    expect(getByText('오늘 출석 완료!')).toBeTruthy();
  });
});
