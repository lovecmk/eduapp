import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { WeeklyChart } from '../WeeklyChart';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import type { DailyProgress } from '../../../domain/models/StudyStats';

const wrap = (weekly: DailyProgress[]) =>
  render(
    <ThemeProvider>
      <WeeklyChart weekly={weekly} />
    </ThemeProvider>,
  );

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const zeros: DailyProgress[] = DOW.map((label) => ({ label, count: 0 }));
const withData: DailyProgress[] = DOW.map((label, i) => ({ label, count: i }));

describe('WeeklyChart', () => {
  it('학습 기록이 없으면 빈 캔버스 대신 안내 문구를 보여준다', () => {
    wrap(zeros);
    expect(screen.getByText('아직 학습 기록이 없어요')).toBeTruthy();
    expect(screen.getByText('오늘 카드를 학습하면 여기에 그래프가 쌓여요')).toBeTruthy();
  });

  it('빈 상태에서는 범례를 숨긴다(설명할 그래프가 없으므로)', () => {
    wrap(zeros);
    expect(screen.queryByText('최다 학습일')).toBeNull();
  });

  it('데이터가 있으면 그래프와 범례를 보여주고 빈 안내는 감춘다', () => {
    wrap(withData);
    expect(screen.queryByText('아직 학습 기록이 없어요')).toBeNull();
    expect(screen.getByText('최다 학습일')).toBeTruthy();
    // '일평균'은 요약 칩과 범례 두 곳에 나오므로 존재 여부만 확인한다.
    expect(screen.getAllByText('일평균').length).toBeGreaterThan(0);
  });

  it('총합과 일평균을 계산해 표시한다', () => {
    wrap(withData); // 0+1+2+3+4+5+6 = 21, 평균 3.0
    expect(screen.getByText('21')).toBeTruthy();
    expect(screen.getByText('3.0')).toBeTruthy();
  });

  it('기간 선택 탭(1주/2주/한달)을 제공한다', () => {
    wrap(withData);
    expect(screen.getByText('1주')).toBeTruthy();
    expect(screen.getByText('2주')).toBeTruthy();
    expect(screen.getByText('한달')).toBeTruthy();
  });

  it('빈 배열이 들어와도 크래시하지 않는다', () => {
    expect(() => wrap([])).not.toThrow();
  });
});
