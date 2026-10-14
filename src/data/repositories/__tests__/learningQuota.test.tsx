const mockPostDurable = jest.fn();
jest.mock('../../network/ApiClient', () => ({ apiClient: { postDurable: (...args: unknown[]) => mockPostDurable(...args) } }));
import { LearningQuotaRepository } from '../LearningQuotaRepository';
import { useDailyLearningStore } from '../../../store/dailyLearningStore';
import { ApiError } from '../../network/errors';

beforeEach(() => { mockPostDurable.mockReset(); useDailyLearningStore.setState({ newLearnedToday: 0 }); });
it('records a durable offline completion once it is safely queued', async () => {
 mockPostDurable.mockResolvedValue('queued');
 await new LearningQuotaRepository().recordCompletion(2);
 expect(useDailyLearningStore.getState().usedToday()).toBe(2);
 expect(mockPostDurable).toHaveBeenCalledWith('/inner/api/v1/learning/complete', { count: 2 }, expect.any(String));
});
it('never hides a missing endpoint or changes the quota for a rejected completion', async () => {
 mockPostDurable.mockRejectedValue(new ApiError(404, 'missing'));
 await expect(new LearningQuotaRepository().recordCompletion(1)).rejects.toMatchObject({ status: 404 });
 expect(useDailyLearningStore.getState().usedToday()).toBe(0);
});
