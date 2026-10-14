import { DailyAssignmentRepository } from '../DailyAssignmentRepository';
import { apiClient } from '../../network/ApiClient';
import { advanceSessionEpoch } from '../../network/sessionEpoch';
import { applyPersonalReviewPolicy, setPersonalReviewPolicy } from '../../network/personalReviewPolicy';
import { initialState, schedule } from '../../../domain/srs';

jest.mock('../../network/ApiClient', () => ({ apiClient: { get: jest.fn() } }));
afterEach(() => { jest.clearAllMocks(); setPersonalReviewPolicy(null); });
it('계정 전환 후 도착한 이전 응답이 새 계정의 복습 정책을 바꾸지 않는다', async () => {
  let resolve!: (value: unknown) => void;
  (apiClient.get as jest.Mock).mockReturnValue(new Promise(done => resolve = done));
  const pending = new DailyAssignmentRepository().get();
  advanceSessionEpoch();
  resolve({ cards: [], personalized: true, review_policy: { first_days: 20, repeat_days: 10 } });
  await expect(pending).rejects.toMatchObject({ kind: 'cancelled' });
  const prev = initialState(); const next = schedule(prev, 'again');
  expect(applyPersonalReviewPolicy(prev, next, 'again').dueAt).not.toBe(next.dueAt);
  expect(applyPersonalReviewPolicy(prev, next, 'again').dueAt - (next.lastReviewedAt ?? Date.now())).toBeLessThanOrEqual(3 * 86400000);
});
it('응답 객체를 이후 변경해도 설치된 정책은 바뀌지 않는다', () => {
  const policy = { first_days: 5, repeat_days: 3 };
  setPersonalReviewPolicy(policy); policy.first_days = 99;
  const previous = initialState(); const next = { ...schedule(previous, 'again'), lastReviewedAt: Date.parse('2026-10-01T15:01:00Z') };
  expect(new Date(applyPersonalReviewPolicy(previous, next, 'again').dueAt).toISOString()).toBe('2026-10-06T15:00:00.000Z');
});
