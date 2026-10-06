import { DailyAssignmentRepository } from '../DailyAssignmentRepository';
import { apiClient } from '../../network/ApiClient';
import { setPersonalReviewPolicy } from '../../network/personalReviewPolicy';

jest.mock('../../network/ApiClient', () => ({ apiClient: { get: jest.fn() } }));
jest.mock('../../../utils/logger', () => ({ logger: { warn: jest.fn() } }));
const card = (id: number, kind = 'NEW') => ({ id: `test_e2e_${id}`, category_cd: 'ELEC', difficulty_cd: 'MEDIUM', card_type_cd: 'EXPLANATION', status_cd: 'UNSTUDIED', question_txt: '한글 ①→② 🔥', kind, done: false, recommend_reason: 'JOB' });
const deck = (cards: ReturnType<typeof card>[]) => ({ personalized: true, review_policy: { first_days: 5, repeat_days: 3 }, cards, target_count: cards.length, done_count: 0 });
afterEach(() => { jest.clearAllMocks(); setPersonalReviewPolicy(null); });
it.each([
  deck([1, 2, 3, 4].map(id => card(id))),
  deck([1, 2, 3].map(id => card(id, 'REVIEW'))),
  deck([card(1, 'invalid')]),
  { ...deck([card(1)]), target_count: 5 },
  { ...deck([card(1)]), done_count: 1 },
  { ...deck([]), review_policy: { first_days: 0, repeat_days: 3 } },
  { ...deck([]), day: '2026-9-6', resets_at: '2026-10-07T00:00:00Z' },
  { ...deck([]), day: '2026-12-6', resets_at: '2027-01-06T15:00:00Z' },
])('개인화 서버 계약 위반을 학습 목록으로 승인하지 않는다 (%j)', async value => {
  (apiClient.get as jest.Mock).mockResolvedValue(value);
  await expect(new DailyAssignmentRepository().get()).rejects.toMatchObject({ status: 502 });
});
it('신규3+복습2와 빈 목록은 승인하고 구서버 장수 정책은 유지한다', async () => {
  for (const value of [deck([card(1), card(2), card(3), card(4, 'REVIEW'), card(5, 'REVIEW')]), deck([]), { ...deck([]), day: '2026-9-6', resets_at: '2026-10-06T15:00:00Z' }, { cards: [1, 2, 3, 4].map(id => card(id)) }]) {
    (apiClient.get as jest.Mock).mockResolvedValue(value);
    await expect(new DailyAssignmentRepository().get()).resolves.toBeDefined();
  }
});
