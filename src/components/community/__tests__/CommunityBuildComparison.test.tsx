import React from 'react';
import { render, screen } from '@testing-library/react-native';
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
const mockCommunity = jest.fn();
jest.mock('../../../hooks/useCommunity', () => ({ useCommunity: () => mockCommunity() }));
jest.mock('../RooftopCrates', () => ({ RooftopCrates: () => null }));
import { CommunityBuildCard } from '../CommunityBuildCard';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import { useFactionStore } from '../../../store/factionStore';

const building = {
  floorSize: 20000,
  current: { month: '2026-10', label: '10월', problems: 200000, floors: 10, winner: 'flame', factions: [
    { id: 'flame', floors: 5, problems: 100000 },
    { id: 'frost', floors: 3, problems: 70000 },
    { id: 'volt', floors: 1, problems: 30000 },
  ] }, history: [],
};
it('shows every faction and identical metrics without expanding, highlighting mine', () => {
  useFactionStore.setState({ faction: 'frost' });
  mockCommunity.mockReturnValue({ data: { building } });
  render(<ThemeProvider><CommunityBuildCard /></ThemeProvider>);
  expect(screen.getByText('프로스트 (나)')).toBeTruthy();
  expect(screen.getByText('플레임')).toBeTruthy();
  expect(screen.getByText('볼트')).toBeTruthy();
  expect(screen.getAllByText('지은 층수')).toHaveLength(3);
  expect(screen.getAllByText('기여 문제')).toHaveLength(3);
  expect(screen.getAllByText('전체 비중')).toHaveLength(3);
  expect(screen.getByText('100,000')).toBeTruthy();
  expect(screen.getByText('70,000')).toBeTruthy();
  expect(screen.getByText('30,000')).toBeTruthy();
});
it('shows aggregate-unavailable status rather than fabricating faction values', () => {
  mockCommunity.mockReturnValue({ data: { building: { ...building, current: { ...building.current, factions: undefined } } } });
  render(<ThemeProvider><CommunityBuildCard /></ThemeProvider>);
  expect(screen.queryByText('기여 문제')).toBeNull();
  expect(screen.getByText(/집계/)).toBeTruthy();
});
