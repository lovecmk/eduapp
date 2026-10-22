const mockPostDurable = jest.fn();
jest.mock('../../network/ApiClient', () => ({ apiClient: { postDurable: (...args: unknown[]) => mockPostDurable(...args) } }));
import { LearningQuotaRepository } from '../LearningQuotaRepository';
import { useDailyLearningStore } from '../../../store/dailyLearningStore';
import { ApiError } from '../../network/errors';
import { advanceSessionEpoch } from '../../network/sessionEpoch';

beforeEach(() => { mockPostDurable.mockReset(); useDailyLearningStore.setState({ newLearnedToday: 0 }); });
it('records a durable offline completion once it is safely queued', async () => {
 mockPostDurable.mockResolvedValue('queued');
 await new LearningQuotaRepository().recordCompletion(2);
 expect(useDailyLearningStore.getState().usedToday()).toBe(2);
 expect(mockPostDurable).toHaveBeenCalledWith('/inner/api/v1/learning/complete', { count: 2, completed_at: expect.any(String) }, expect.any(String));
});

it('retains the original Korean date across a delayed write and never consumes tomorrow quota', async () => {
 jest.useFakeTimers();
 jest.setSystemTime(new Date('2026-10-23T14:59:59Z'));
 let finish!: (value: string) => void;
 mockPostDurable.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
 try {
  const pending = new LearningQuotaRepository().recordCompletion(1);
  jest.setSystemTime(new Date('2026-10-23T15:00:01Z'));
  finish('sent');
  await pending;
  expect(mockPostDurable.mock.calls[0][1]).toEqual({ count: 1, completed_at: '2026-10-23T14:59:59.000Z' });
  expect(useDailyLearningStore.getState().usedToday()).toBe(0);
 } finally { jest.useRealTimers(); }
});

it('does not apply a previous account completion to a new login', async () => {
 let finish!: (value: string) => void;
 mockPostDurable.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
 const pending = new LearningQuotaRepository().recordCompletion(1);
 advanceSessionEpoch();
 finish('queued');
 await expect(pending).rejects.toMatchObject({ kind: 'cancelled' });
 expect(useDailyLearningStore.getState().usedToday()).toBe(0);
});
it('never hides a missing endpoint or changes the quota for a rejected completion', async () => {
 mockPostDurable.mockRejectedValue(new ApiError(404, 'missing'));
 await expect(new LearningQuotaRepository().recordCompletion(1)).rejects.toMatchObject({ status: 404 });
 expect(useDailyLearningStore.getState().usedToday()).toBe(0);
});
