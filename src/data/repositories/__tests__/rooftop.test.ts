jest.mock('../../network/ApiClient', () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));
import { apiClient } from '../../network/ApiClient';
import { RooftopRepository } from '../RooftopRepository';
import { packBalance, shardBalance, mergeSnapshots, EMPTY_SNAPSHOT } from '../../../domain/models/Collection';
import { canOpenRooftop } from '../../../domain/rooftopPolicy';
import { monthKey } from '../../../domain/buildingCrates';

const receipt = { month: '2026-10', floor: 10, packs: 1, shards: 30, opened_at: '2026-10-06T00:00:00Z' };
const repo = new RooftopRepository();
it('matches authenticated GET and POST contracts without client reward/user fields', async () => {
  jest.mocked(apiClient.get).mockResolvedValue({ month: '2026-10', floors: 10, my_bricks: 5, history: [receipt] });
  expect((await repo.get()).history).toEqual([receipt]);
  expect(apiClient.get).toHaveBeenCalledWith('/inner/api/v1/community/rooftop');
  jest.mocked(apiClient.post).mockResolvedValue(receipt);
  expect(await repo.open('2026-10', 10)).toEqual(receipt);
  expect(apiClient.post).toHaveBeenCalledWith('/inner/api/v1/community/rooftop/open', { month: '2026-10', floor: 10 });
});
it('rejects malformed and mismatched results and propagates undeployed/offline errors', async () => {
  jest.mocked(apiClient.get).mockResolvedValue({ history: [] });
  await expect(repo.get()).rejects.toThrow('응답 형식');
  jest.mocked(apiClient.post).mockResolvedValue({ ...receipt, packs: 999 });
  await expect(repo.open('2026-10', 10)).rejects.toThrow('응답 형식');
  jest.mocked(apiClient.post).mockResolvedValue(receipt);
  await expect(repo.open('2026-10', 5)).rejects.toThrow('상자와');
  jest.mocked(apiClient.post).mockRejectedValue(new Error('not deployed'));
  await expect(repo.open('2026-10', 10)).rejects.toThrow('not deployed');
});
it('adds server credits once, preserves spending and tolerates legacy snapshots', () => {
  const remote = { ...EMPTY_SNAPSHOT, rooftopPacks: 3, rooftopShards: 30 };
  const s = mergeSnapshots({ ...EMPTY_SNAPSHOT, packsOpened: 1, shardsSpent: 10 }, remote);
  expect(packBalance(s)).toBe(2);
  expect(shardBalance(s)).toBe(20);
  expect(mergeSnapshots(s, remote)).toEqual(s);
  expect(mergeSnapshots(s, EMPTY_SNAPSHOT).rooftopPacks).toBe(3);
});
it('uses KST month/day, exact 60 second cooldown, daily 3 and ISO-week 5 caps', () => {
  const at = Date.parse('2026-10-05T16:00:00Z');
  expect(monthKey(new Date('2026-09-30T15:00:00Z'))).toBe('2026-10');
  expect(canOpenRooftop([{ opened_at: new Date(at - 59999).toISOString() }], at)).toBe(false);
  expect(canOpenRooftop([{ opened_at: new Date(at - 60000).toISOString() }], at)).toBe(true);
  const daily = Array.from({ length: 3 }, (_, i) => ({ opened_at: new Date(at - (i + 1) * 60000).toISOString() }));
  expect(canOpenRooftop(daily, at)).toBe(false);
  const weekly = Array.from({ length: 5 }, (_, i) => ({ opened_at: new Date(at - 86400000 - i * 60000).toISOString() }));
  expect(canOpenRooftop(weekly, at)).toBe(false);
  expect(canOpenRooftop(weekly, at + 7 * 86400000)).toBe(true);
});
