// '지금 함께 학습 중' 카드 — 실제 접속자 데이터를 어떻게 그리는지.
//
// 서버가 이 값을 실제로 세기 전까지 이 카드는 늘 0명이었고, 그때 화면에는
// 동료가 하나도 없는데 '+0' 동그라미만 홀로 떠 있었다. 사람이 있는데 이름을
// 못 읽은 것처럼 보이는 상태다. 여기서 지키는 것은 세 가지다.
//
//   1) 혼자면 아바타 줄 대신 안내 한 줄을 그린다('+0' 을 만들지 않는다).
//   2) '+N' 은 실제로 접힌 사람이 있을 때만 뜬다 — 나를 뺀 수로 센다.
//   3) 접속자 수는 서버 값을 그대로 보여 준다.

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { LivePresenceCard } from '../LivePresenceCard';
import type { CommunitySnapshot } from '../../../domain/models/Community';

// jest.mock 의 팩토리는 바깥 변수를 볼 수 없다 — `mock` 접두사만 예외다.
const mockUseCommunity = jest.fn();
jest.mock('../../../hooks/useCommunity', () => ({
  useCommunity: () => mockUseCommunity() as unknown,
}));

function snapshot(over: Partial<CommunitySnapshot> = {}): CommunitySnapshot {
  return {
    onlineNow: 1,
    studiedToday: 0,
    totalMinutesToday: 0,
    dailyGoalMinutes: 3,
    companions: [],
    activities: [],
    totalCardsAllTime: 0,
    leaderboard: [],
    myRank: 0,
    weeklyActivity: [],
    ...over,
  } as CommunitySnapshot;
}

function companion(id: string, name: string) {
  return { id, name, color: '#5C6BC0' };
}

function show(data: CommunitySnapshot) {
  mockUseCommunity.mockReturnValue({ data, isLoading: false });
  render(<LivePresenceCard />);
}

it('혼자일 때는 +0 대신 안내 한 줄을 그린다', () => {
  show(snapshot({ onlineNow: 1, companions: [] }));
  expect(screen.queryByText('+0')).toBeNull();
  expect(screen.getByText(/나 혼자예요/)).toBeTruthy();
});

it('동료가 있으면 이름을 그리고 안내 줄은 사라진다', () => {
  show(snapshot({
    onlineNow: 3,
    companions: [companion('u1', '불끄는진섭'), companion('u2', '조용한점검')],
  }));
  expect(screen.getByText(/불끄는진섭/)).toBeTruthy();
  expect(screen.queryByText(/나 혼자예요/)).toBeNull();
  // 3명 = 나 + 2명, 둘 다 그렸으므로 접힌 사람이 없다.
  expect(screen.queryByText(/^\+\d+$/)).toBeNull();
});

it('나를 뺀 인원으로 +N 을 센다', () => {
  // 접속 9명 = 나 + 8명. 아바타는 5명까지라 3명이 접힌다.
  const many = ['가', '나', '다', '라', '마'].map((n, i) => companion(`u${i}`, n));
  show(snapshot({ onlineNow: 9, companions: many }));
  // onlineNow - 5 로 세던 예전 식이면 '+4' 가 뜬다(나를 빼지 않아서).
  expect(screen.getByText('+3')).toBeTruthy();
  expect(screen.getByText(/외 3명/)).toBeTruthy();
});

it('접속자 수는 서버 값을 그대로 보여 준다', () => {
  show(snapshot({ onlineNow: 12, companions: [companion('u1', '진섭')] }));
  expect(screen.getByText('12')).toBeTruthy();
});
