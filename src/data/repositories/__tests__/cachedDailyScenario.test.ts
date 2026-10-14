const cache = new Map<string, string>();
const mockOwner = jest.fn();
const history: Record<string, string[]> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: {
  getItem: async (key: string) => cache.get(key) ?? null,
  setItem: async (key: string, value: string) => { cache.set(key, value); },
} }));
jest.mock('../../storage/secureStorage', () => ({ secureStorage: { getItem: () => mockOwner() }, StorageKeys: { cachedUser: 'owner' } }));
jest.mock('../../network/env', () => ({ env: { apiBaseUrl: 'https://server-a' } }));
jest.mock('../../network/ApiClient', () => ({ apiClient: { get: jest.fn() } }));
jest.mock('../../../store/srsStore', () => ({ useSrsStore: { getState: () => ({ history }) } }));
jest.mock('../../../utils/logger', () => ({ logger: { warn: jest.fn() } }));

import { CachedDailyAssignmentRepository, LiveDailyAssignmentRepository, OfflineDailyAssignmentRepository, serverDayKey } from '../CachedDailyAssignmentRepository';
import { apiClient } from '../../network/ApiClient';

beforeEach(() => {
  cache.clear();
  for (const key of Object.keys(history)) delete history[key];
  mockOwner.mockResolvedValue(JSON.stringify({ id: 'a' }));
});
const card = { id: 'real-server-card', category_cd: 'ELEC', difficulty_cd: 'EASY', card_type_cd: 'EXPLANATION', status_cd: 'UNSTUDIED', question_txt: 'Question', answer_txt: 'Answer', note_txt: 'Card information' };
it('restores only a validated real deck and merges offline completions', async () => {
  (apiClient.get as jest.Mock).mockResolvedValue({ day: serverDayKey(), cards: [card], target_count: 1, done_count: 0 });
  await new LiveDailyAssignmentRepository().get();
  history[serverDayKey()] = [card.id];
  const deck = await new CachedDailyAssignmentRepository().get();
  expect(deck.cards[0].card.id).toBe(card.id);
  expect(deck.cards[0].done).toBe(true);
  expect(deck.doneCount).toBe(1);
});
it.each(['different-owner', 'different-server', 'previous-day', 'missing'])('rejects %s instead of fabricating mock learning', async reason => {
  cache.set('live-daily-assignment', JSON.stringify({ owner: reason === 'different-owner' ? 'b' : 'a', server: reason === 'different-server' ? 'https://server-b' : 'https://server-a', dto: { day: reason === 'previous-day' ? '2000-0-1' : serverDayKey(), cards: [card] } }));
  if (reason === 'missing') cache.clear();
  await expect(new CachedDailyAssignmentRepository().get()).rejects.toMatchObject({ kind: 'offline' });
});
it('uses the Korean server day across UTC midnight', () => {
  expect(serverDayKey(Date.parse('2026-10-11T15:01:00Z'))).toBe('2026-9-12');
});

import { ApiError } from '../../network/errors';
it('uses the real cache only during a transient outage and rejects missing routes', async () => {
  (apiClient.get as jest.Mock).mockResolvedValue({ day: serverDayKey(), cards: [card], target_count: 1, done_count: 0 });
  const repo = new OfflineDailyAssignmentRepository();
  await repo.get();
  (apiClient.get as jest.Mock).mockRejectedValue(new ApiError(503, 'outage', 'server'));
  expect((await repo.get()).cards[0].card.id).toBe(card.id);
  (apiClient.get as jest.Mock).mockRejectedValue(new ApiError(404, 'missing route', 'server'));
  await expect(repo.get()).rejects.toMatchObject({ status: 404 });
});
