const mockValues = new Map<string, string>();
const mockGet = jest.fn();
const mockSet = jest.fn();
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: (...args: unknown[]) => mockGet(...args), setItem: (...args: unknown[]) => mockSet(...args) }));
import { claimDailyWelcome, dailyWelcomeKey } from '../dailyWelcome';
import { DAILY_QUOTES } from '../../constants/dailyQuotes';

beforeEach(() => {
  mockValues.clear();
  mockGet.mockImplementation(async key => mockValues.get(key) ?? null);
  mockSet.mockImplementation(async (key, value) => { mockValues.set(key, value); });
});
it('contains exactly the 100 supplied, unique category-labelled quotes', () => {
  expect(DAILY_QUOTES).toHaveLength(100);
  expect(new Set(DAILY_QUOTES).size).toBe(100);
  expect(DAILY_QUOTES.every(line => /^\[[^\]]+\] .+\.$/.test(line))).toBe(true);
});
it('persists before returning and shows only once for the same user/day', async () => {
  const random = jest.fn(() => 0);
  const first = await claimDailyWelcome('a', '2026-10-22', 5, () => true, random);
  expect(first).toMatchObject({ streak: 5, quoteIndex: 0, category: '성장' });
  expect(mockValues.has(dailyWelcomeKey('a'))).toBe(true);
  expect(await claimDailyWelcome('a', '2026-10-22', 8, () => true, random)).toBeNull();
  expect(random).toHaveBeenCalledTimes(1);
});
it('deduplicates simultaneous startup requests', async () => {
  const results = await Promise.all(Array.from({ length: 20 }, () => claimDailyWelcome('a', '2026-10-22', 2)));
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(mockSet).toHaveBeenCalledTimes(1);
});
it('keeps account claims separate even after switching back', async () => {
  expect(await claimDailyWelcome('a', '2026-10-22', 1)).not.toBeNull();
  expect(await claimDailyWelcome('b', '2026-10-22', 3)).not.toBeNull();
  expect(await claimDailyWelcome('a', '2026-10-22', 1)).toBeNull();
});
it('selects again on the next day and avoids the previous quote', async () => {
  const one = await claimDailyWelcome('a', '2026-10-22', 0, () => true, () => 0);
  const two = await claimDailyWelcome('a', '2026-10-23', 1, () => true, () => 0);
  expect(two?.quoteIndex).not.toBe(one?.quoteIndex);
  expect(await claimDailyWelcome('a', '2026-10-22', 0)).toBeNull();
});
it('all 100 quotes can be selected', async () => {
  const selected = new Set<number>();
  for (let i = 0; i < 100; i++) {
    const quote = await claimDailyWelcome(`u${i}`, '2026-10-22', 1, () => true, () => (i + 0.1) / 100);
    selected.add(quote!.quoteIndex);
  }
  expect(selected.size).toBe(100);
});
it('does not consume the day after unmount/session cancellation while reading storage', async () => {
  let release!: (value: string | null) => void;
  let entered!: () => void;
  const reading = new Promise<void>(done => { entered = done; });
  mockGet.mockImplementationOnce(() => { entered(); return new Promise<string | null>(done => { release = done; }); });
  let active = true;
  const pending = claimDailyWelcome('a', '2026-10-22', 1, () => active);
  await reading; active = false; release(null);
  expect(await pending).toBeNull();
  expect(mockSet).not.toHaveBeenCalled();
  expect(await claimDailyWelcome('a', '2026-10-22', 1)).not.toBeNull();
});
it.each(['broken JSON', 'null', '{"quoteIndex":1000}'])('recovers an invalid saved record: %s', async raw => {
  mockValues.set(dailyWelcomeKey('a'), raw);
  expect(await claimDailyWelcome('a', '2026-10-22', 1)).not.toBeNull();
});
it('a storage failure does not poison subsequent claims', async () => {
  mockSet.mockRejectedValueOnce(new Error('storage unavailable'));
  await expect(claimDailyWelcome('a', '2026-10-22', 1)).rejects.toThrow('storage unavailable');
  expect(await claimDailyWelcome('a', '2026-10-22', 1)).not.toBeNull();
});
