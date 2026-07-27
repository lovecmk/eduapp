import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

import { ReviewPlanCard } from '../ReviewPlanCard';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import type { ReviewPlan } from '../../../domain/reviewPlan';
import type { LearningCard } from '../../../domain/models/LearningCard';

// 이 카드가 하는 일은 하나다: 지금 무엇을 해야 하는지 분명히 말하는 것.
// 그래서 '몇 장인지'와 '왜 지금인지'가 화면에 있는지를 확인한다.

const card = (id: string) => ({ id, title: id }) as LearningCard;

function plan(over: Partial<ReviewPlan> = {}): ReviewPlan {
  return {
    queue: [],
    urgency: 'resting',
    overdue: 0,
    dueToday: 0,
    fragile: 0,
    nextDueAt: null,
    upcoming: [],
    ...over,
  };
}

const renderCard = (p: ReviewPlan, onStart = jest.fn()) =>
  render(
    <ThemeProvider>
      <ReviewPlanCard plan={p} onStart={onStart} />
    </ThemeProvider>,
  );

describe('ReviewPlanCard', () => {
  it('할 일이 있으면 장수와 시작 버튼을 보여 준다', () => {
    renderCard(
      plan({ queue: [card('a'), card('b')], urgency: 'today', dueToday: 2 }),
    );
    expect(screen.getByText('지금 복습할 2장')).toBeTruthy();
    expect(screen.getByText('지금 시작하기')).toBeTruthy();
  });

  it('기한이 지났으면 미루면 손해라는 것을 말한다', () => {
    renderCard(plan({ queue: [card('a')], urgency: 'overdue', overdue: 1 }));
    // 숫자만 보여 주면 급한지 알 수 없다.
    expect(screen.getByText(/미룰수록/)).toBeTruthy();
  });

  it('구성을 쪼개 보여 준다 — 왜 이 장수인지 납득되도록', () => {
    renderCard(
      plan({
        queue: [card('a'), card('b'), card('c')],
        urgency: 'overdue',
        overdue: 2,
        dueToday: 1,
        fragile: 1,
      }),
    );
    expect(screen.getByText('기한 지남')).toBeTruthy();
    expect(screen.getByText('오늘 예정')).toBeTruthy();
    expect(screen.getByText('자주 잊음')).toBeTruthy();
  });

  it('누르면 복습을 시작한다', () => {
    const onStart = jest.fn();
    renderCard(plan({ queue: [card('a')], urgency: 'today', dueToday: 1 }), onStart);
    fireEvent.press(screen.getByText('지금 시작하기'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('할 일이 없으면 시작 버튼을 내밀지 않는다', () => {
    // 복습이 비어 있는 것은 잘 해낸 결과지 실패가 아니다 —
    // 누를 것이 없는데 버튼만 두면 뭘 놓친 것처럼 느껴진다.
    renderCard(plan({ urgency: 'resting', nextDueAt: Date.now() + 86_400_000 }));
    expect(screen.queryByText('지금 시작하기')).toBeNull();
    expect(screen.getByText('오늘 복습은 끝났어요')).toBeTruthy();
  });

  it('학습 이력이 없으면 복습부터 강요하지 않는다', () => {
    renderCard(plan({ urgency: 'empty' }));
    expect(screen.getByText('아직 복습할 카드가 없어요')).toBeTruthy();
    expect(screen.queryByText('지금 시작하기')).toBeNull();
  });

  it('스크린리더가 무엇을 하는 버튼인지 알 수 있다', () => {
    renderCard(plan({ queue: [card('a')], urgency: 'today', dueToday: 1 }));
    expect(screen.getByLabelText(/지금 복습할 1장/)).toBeTruthy();
  });
});
