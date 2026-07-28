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
    dueCount: 0,
    state: 'resting',
    longRested: 0,
    fragile: 0,
    nextDueAt: null,
    upcoming: [],
    now: Date.now(),
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
  it('볼 카드가 있으면 장수와 보기 버튼을 보여 준다', () => {
    renderCard(plan({ queue: [card('a'), card('b')], state: 'ready' }));
    expect(screen.getByText('복습하기 좋은 2장')).toBeTruthy();
    expect(screen.getByText('지금 보기')).toBeTruthy();
  });

  it('재촉하지 않는다 — 손실·마감의 말을 쓰지 않는다', () => {
    // 복습은 사용자가 하기로 정하는 일이다. 안 했을 때 잃는 것을 들먹이면
    // 그건 안내가 아니라 협박이 된다.
    renderCard(
      plan({ queue: [card('a'), card('b')], state: 'ready', longRested: 2, fragile: 1 }),
    );
    for (const word of ['미룰수록', '기한', '지남', '밀린', '늦', '놓치']) {
      expect(screen.queryByText(new RegExp(word))).toBeNull();
    }
  });

  it('갚아야 할 목록처럼 숫자를 쪼개 보여 주지 않는다', () => {
    renderCard(
      plan({ queue: [card('a'), card('b'), card('c')], state: 'ready', longRested: 2, fragile: 1 }),
    );
    expect(screen.queryByText('기한 지남')).toBeNull();
    expect(screen.queryByText('오늘 예정')).toBeNull();
    // 자주 잊는 카드는 문장 안에서 한 번만 언급한다(정보이지 청구서가 아니다).
    expect(screen.getByText('자주 잊는 1장이 함께 있어요')).toBeTruthy();
  });

  it('누르면 복습을 시작한다', () => {
    const onStart = jest.fn();
    renderCard(plan({ queue: [card('a')], state: 'ready' }), onStart);
    fireEvent.press(screen.getByText('지금 보기'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('볼 것이 없는 날은 쉬어도 된다고 말한다', () => {
    // '오늘 치를 다 했다'고 말하면, 안 한 날은 자동으로 빚이 된다.
    renderCard(plan({ state: 'resting', nextDueAt: Date.now() + 86_400_000 }));
    expect(screen.queryByText('지금 보기')).toBeNull();
    expect(screen.getByText('지금은 쉬어도 좋아요')).toBeTruthy();
  });

  it('학습 이력이 없으면 복습부터 강요하지 않는다', () => {
    renderCard(plan({ state: 'empty' }));
    expect(screen.getByText('아직 복습할 카드가 없어요')).toBeTruthy();
    expect(screen.queryByText('지금 시작하기')).toBeNull();
  });

  it('스크린리더가 무엇을 하는 버튼인지 알 수 있다', () => {
    renderCard(plan({ queue: [card('a')], state: 'ready' }));
    expect(screen.getByLabelText(/복습하기 좋은 1장/)).toBeTruthy();
  });
});
