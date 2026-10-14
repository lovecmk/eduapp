import { applyPersonalReviewPolicy, setPersonalReviewPolicy, personalReviewHint } from '../personalReviewPolicy';
import { advanceSessionEpoch } from '../sessionEpoch';
import { initialState, schedule } from '../../../domain/srs';
import { ProgressRepository } from '../../repositories/ProgressRepository';
import { apiClient } from '../ApiClient';

jest.mock('../ApiClient', () => ({ apiClient: { postDurable: jest.fn().mockResolvedValue(undefined) } }));
afterEach(() => { setPersonalReviewPolicy(null); jest.clearAllMocks(); });
it('KST 자정 기준 5일/3일과 알고 있었어요의 복습 완료를 적용한다', () => {
  const now = Date.parse('2026-10-01T15:01:00Z');
  const previous = initialState(); const next = { ...schedule(previous, 'again'), lastReviewedAt: now };
  setPersonalReviewPolicy({ first_days: 5, repeat_days: 3 });
  expect(new Date(applyPersonalReviewPolicy(previous, next, 'again').dueAt).toISOString()).toBe('2026-10-06T15:00:00.000Z');
  expect(new Date(applyPersonalReviewPolicy({ ...previous, lastGrade: 'again' }, next, 'again').dueAt).toISOString()).toBe('2026-10-04T15:00:00.000Z');
  expect(applyPersonalReviewPolicy(previous, next, 'good').box).toBeGreaterThanOrEqual(4);
  expect(personalReviewHint(previous, 'again')).toBe('5일 후 복습');
  expect(personalReviewHint({ ...previous, lastGrade: 'again' }, 'again')).toBe('3일 후 복습');
  expect(personalReviewHint(previous, 'good')).toBe('복습 완료');
});
it('구버전 API·다른 로그인 세션에는 기본 3일 복습을 적용한다', () => {
  const previous = initialState(); const next = schedule(previous, 'again');
  expect(applyPersonalReviewPolicy(previous, next, 'again').dueAt - (Math.floor(((next.lastReviewedAt ?? Date.now()) + 9 * 3600000) / 86400000) * 86400000 - 9 * 3600000)).toBe(3 * 86400000);
  setPersonalReviewPolicy({ first_days: 5, repeat_days: 3 }); advanceSessionEpoch();
  expect(applyPersonalReviewPolicy(previous, next, 'again').dueAt - (Math.floor(((next.lastReviewedAt ?? Date.now()) + 9 * 3600000) / 86400000) * 86400000 - 9 * 3600000)).toBe(3 * 86400000);
  setPersonalReviewPolicy({ first_days: -1, repeat_days: 3 });
  expect(applyPersonalReviewPolicy(previous, next, 'again').dueAt - (Math.floor(((next.lastReviewedAt ?? Date.now()) + 9 * 3600000) / 86400000) * 86400000 - 9 * 3600000)).toBe(3 * 86400000);
});
it('기존 durable 경로에 이벤트 ID·실제 학습시각·서로 다른 두 평가를 함께 보낸다', async () => {
  const state = { ...initialState(), lastReviewedAt: Date.parse('2026-10-01T15:01:00Z'), perceivedDifficulty: 'HARD' as const };
  await new ProgressRepository().pushGrade('card1', 'good', state);
  await new ProgressRepository().pushGrade('card1', 'good', state);
  const calls = (apiClient.postDurable as jest.Mock).mock.calls;
  expect(calls[0]).toEqual(calls[1]);
  expect(calls[0][0]).toBe('/inner/api/v1/progress/grade');
  expect(calls[0][1]).toMatchObject({ self_check: 'KNOWN', perceived_difficulty: 'HARD', last_reviewed_at: '2026-10-01T15:01:00.000Z', event_id: 'grade:card1:1790866860000' });
});
