import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { HelpWantedCard, pickHelpWanted } from '../HelpWantedCard';
import { MyContributionLine } from '../MyContributionLine';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import type { Question, Answer } from '../../../store/qnaStore';

const answer = (mine = false): Answer => ({
  id: `a${Math.random()}`, author: 'x', color: '#000', body: 'b',
  likes: 0, likedByMe: false, mine, minutesAgo: 1,
});

const q = (over: Partial<Question>): Question => ({
  id: 'q1', author: '홍', color: '#000', title: '제목', body: '본문',
  category: '전기 위험', answers: [], likes: 0, likedByMe: false, minutesAgo: 10,
  ...over,
});

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe('pickHelpWanted — 답변 대기 질문 선정', () => {
  it('답변이 없는 남의 질문을 고른다', () => {
    const picked = pickHelpWanted([
      q({ id: 'answered', answers: [answer()] }),
      q({ id: 'waiting' }),
    ]);
    expect(picked?.id).toBe('waiting');
  });

  it('가장 오래 기다린 질문을 우선한다(방치 방지)', () => {
    const picked = pickHelpWanted([
      q({ id: 'recent', minutesAgo: 5 }),
      q({ id: 'old', minutesAgo: 600 }),
      q({ id: 'mid', minutesAgo: 60 }),
    ]);
    expect(picked?.id).toBe('old');
  });

  it('내 질문은 고르지 않는다(내 질문에 내가 답할 일은 없다)', () => {
    expect(pickHelpWanted([q({ id: 'mine', mine: true })])).toBeNull();
  });

  it('대기 질문이 없으면 null — 카드 자체가 렌더되지 않는다', () => {
    expect(pickHelpWanted([q({ answers: [answer()] })])).toBeNull();
    expect(pickHelpWanted([])).toBeNull();
  });
});

describe('HelpWantedCard', () => {
  it('질문이 있으면 답변을 권한다', () => {
    wrap(<HelpWantedCard question={q({ title: '방폭등급 질문' })} onPress={() => {}} />);
    expect(screen.getByText('답변을 기다리고 있어요')).toBeTruthy();
    expect(screen.getByText('방폭등급 질문')).toBeTruthy();
    expect(screen.getByText('알고 있다면 답변해주세요')).toBeTruthy();
  });

  it('질문이 없으면 아무것도 그리지 않는다(빈 상태 안내조차 노이즈)', () => {
    const { toJSON } = wrap(<HelpWantedCard question={null} onPress={() => {}} />);
    expect(toJSON()).toBeNull();
  });
});

describe('MyContributionLine — 내 기여 한 줄', () => {
  it('내 답변이 있으면 도운 사람 수를 보여준다', () => {
    wrap(<MyContributionLine questions={[
      q({ id: '1', answers: [answer(true), answer(false)] }),
      q({ id: '2', answers: [answer(true)] }),
    ]} />);
    expect(screen.getByText(/답변 2개로 2명을 도왔어요/)).toBeTruthy();
  });

  it('내 질문만 있어도 표시한다', () => {
    wrap(<MyContributionLine questions={[q({ mine: true })]} />);
    expect(screen.getByText(/질문 1개/)).toBeTruthy();
  });

  it('기여가 없으면 침묵한다(빈 상태를 굳이 알리지 않는다)', () => {
    const { toJSON } = wrap(<MyContributionLine questions={[q({ answers: [answer(false)] })]} />);
    expect(toJSON()).toBeNull();
  });
});
