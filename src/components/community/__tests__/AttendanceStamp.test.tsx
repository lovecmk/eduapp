import React from 'react';
import { render, act } from '@testing-library/react-native';
import { AttendanceStamp } from '../AttendanceStamp';
import { CheckInSuccess } from '../CheckInSuccess';
import { Text } from 'react-native';

// 도장·배너 애니메이션은 테스트가 끝난 뒤에도 프레임 타이머로 값을 흘려보낸다.
// 실제 타이머로 두면 그 갱신이 act() 밖에서 일어나 매번 경고가 찍혔다(출력이 더러우면
// 진짜 경고가 묻힌다). 가짜 타이머로 붙잡아 act 안에서 끝까지 돌린다.
beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  act(() => { jest.runOnlyPendingTimers(); });
  jest.useRealTimers();
});

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
