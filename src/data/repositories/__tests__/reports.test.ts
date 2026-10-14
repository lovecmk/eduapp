import { ReportRepository } from '../ReportRepository';
import { apiClient } from '../../network/ApiClient';

jest.mock('../../network/ApiClient', () => ({ apiClient: { postDurable: jest.fn(), get: jest.fn() } }));

it.each(['sent', 'queued'] as const)('returns the durable %s result for accurate submission feedback', async (result) => {
  (apiClient.postDurable as jest.Mock).mockResolvedValue(result);
  expect(await new ReportRepository().submit({ cardId: 'c1', reason: 'wrong_answer', detail: ' 오류\u0000 확인 ' })).toBe(result);
  expect(apiClient.postDurable).toHaveBeenCalledWith('/inner/api/v1/reports', { card_id: 'c1', reason: 'wrong_answer', detail: '오류 확인' }, 'report:c1:wrong_answer');
});

it('propagates rejected submissions so the modal can retry without recording success', async () => {
  (apiClient.postDurable as jest.Mock).mockRejectedValue(new Error('rejected'));
  await expect(new ReportRepository().submit({ cardId: 'c1', reason: 'typo' })).rejects.toThrow('rejected');
});
