import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { CardBackBody } from '../CardBackBody';
import { CardReactionBar } from '../CardReactionBar';
import { CardDifficultyAsk } from '../CardDifficultyAsk';
import { useLikeStore } from '../../../store/likeStore';
import { useBookmarkStore } from '../../../store/bookmarkStore';
import { useReportStore } from '../../../store/reportStore';
import type { LearningCard } from '../../../domain/models/LearningCard';

const card = { id: 'a', title: 'test', conclusion: '해설 본문', principle: '상세 본문', process: '발열 → 점화', fireTriangle: '가연물 산소 열', improvement: '개선 본문', keywords: [] } as unknown as LearningCard;

it('공통 뒷면은 해설→상세→프로세스→3요소→기존 추가 항목 순서다', () => {
  const view = render(<CardBackBody card={card} />);
  const json = JSON.stringify(view.toJSON());
  const ordered = ['해설 본문', '상세 본문', '발열', '가연물 산소 열', '개선 본문'];
  ordered.forEach(text => expect(json.indexOf(text)).toBeGreaterThanOrEqual(0));
  expect(ordered.map(text => json.indexOf(text))).toEqual([...ordered.map(text => json.indexOf(text))].sort((a, b) => a - b));
  view.rerender(<CardBackBody card={{ ...card, conclusion: ' ', principle: '', process: '', fireTriangle: '' }} />);
  expect(view.queryByText('해설 본문')).toBeNull();
  expect(view.queryByText('상세 본문')).toBeNull();
  expect(view.queryByText('화재·폭발 진행 프로세스')).toBeNull();
});

it('뒷면 반응은 카드별로 토글되고 신고는 현재 카드의 호출 경로를 사용한다', () => {
  useLikeStore.setState({ ids: [] }); useBookmarkStore.setState({ ids: [] }); useReportStore.setState({ reports: [] });
  const report = jest.fn();
  const view = render(<CardReactionBar cardId="a" onReport={report} />);
  const event = { stopPropagation: jest.fn() };
  fireEvent.press(view.getByLabelText('좋아요'), event);
  fireEvent.press(view.getByLabelText('저장'), event);
  expect(useLikeStore.getState().ids).toEqual(['a']);
  expect(useBookmarkStore.getState().ids).toEqual(['a']);
  fireEvent.press(view.getByLabelText('신고'), event); expect(report).toHaveBeenCalledTimes(1);
  view.rerender(<CardReactionBar cardId="b" onReport={report} />);
  expect(view.getByLabelText('좋아요')).toBeTruthy();
  expect(view.getByLabelText('저장')).toBeTruthy();
  view.rerender(<CardReactionBar cardId="a" onReport={report} />);
  fireEvent.press(view.getByLabelText('좋아요 취소'), event);
  expect(useLikeStore.getState().ids).toEqual([]);
  expect(view.getByLabelText('저장 취소')).toBeTruthy();
});

it('체감 난이도 모달에는 반응 버튼이 없다', () => {
  const view = render(<CardDifficultyAsk visible onSelect={jest.fn()} onSkip={jest.fn()} />);
  expect(view.queryByTestId('card-reactions')).toBeNull();
  expect(view.queryByText('좋아요')).toBeNull();
  expect(view.queryByText('저장')).toBeNull();
  expect(view.queryByText('신고')).toBeNull();
});
