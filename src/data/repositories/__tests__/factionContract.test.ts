const mockGet = jest.fn(), mockPost = jest.fn(), mockDurable = jest.fn();
jest.mock('../../network/ApiClient', () => ({ apiClient: { get: () => mockGet(), post: (...args: unknown[]) => mockPost(...args), postDurable: (...args: unknown[]) => mockDurable(...args) } }));
import { FactionRepository } from '../FactionRepository';
const repo = new FactionRepository();
beforeEach(() => { mockGet.mockReset(); mockPost.mockReset(); mockDurable.mockReset(); });
it.each([{}, null, { faction_cd: 'unknown' }])('rejects an unverified lookup instead of treating it as an unassigned user: %s', async value => {
  mockGet.mockResolvedValue(value);
  await expect(repo.get()).rejects.toMatchObject({ status: 502 });
});
it.each(['', null])('accepts the explicit unassigned server value: %s', async value => {
  mockGet.mockResolvedValue({ faction_cd: value });
  expect(await repo.get()).toBeNull();
});
it('requires a matching server confirmation and never treats an offline queue as a confirmed choice', async () => {
  mockPost.mockResolvedValue({});
  await expect(repo.set('flame')).rejects.toMatchObject({ status: 502 });
  mockPost.mockResolvedValue({ faction_cd: 'flame' });
  await expect(repo.set('flame')).resolves.toBeUndefined();
  expect(mockDurable).not.toHaveBeenCalled();
});
