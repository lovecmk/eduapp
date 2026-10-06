import { DailyAssignmentRepository } from '../DailyAssignmentRepository';
import { apiClient } from '../../network/ApiClient';
import { applyPersonalReviewPolicy, setPersonalReviewPolicy } from '../../network/personalReviewPolicy';
import { initialState, schedule } from '../../../domain/srs';

jest.mock('../../network/ApiClient', () => ({ apiClient: { get: jest.fn() } }));
jest.mock('../../../utils/logger', () => ({ logger: { warn: jest.fn() } }));
const card = { id: 'contract-card', category_cd: 'ELEC', difficulty_cd: 'MEDIUM', card_type_cd: 'EXPLANATION', status_cd: 'UNSTUDIED', question_txt: '전선이란?' };
afterEach(() => { jest.clearAllMocks(); setPersonalReviewPolicy(null); });

it.each([{}, { cards: null }, { cards: {} }, { cards: [card, card] }, { cards: [card], target_count: -1 }, { cards: [card], done_count: 2 }, { cards: [card], target_count: 1.5 }])('손상된 오늘 응답을 빈 학습이나 잘못된 목표로 표시하지 않는다 (%j)', async dto => {
  (apiClient.get as jest.Mock).mockResolvedValue(dto);
  await expect(new DailyAssignmentRepository().get()).rejects.toMatchObject({ status: 502 });
});
it('기존 서버의 최소 목록과 신규·복습·사유 계약을 유지한다', async () => {
  (apiClient.get as jest.Mock).mockResolvedValue({ cards: [{ ...card, kind: 'REVIEW', done: true, recommend_reason: 'REVIEW_DUE', recommend_score: 0 }] });
  const result = await new DailyAssignmentRepository().get();
  expect(result).toMatchObject({ targetCount: 1, doneCount: 1, cards: [{ kind: 'review', done: true, recommendReason: 'REVIEW_DUE' }] });
});
it('실패한 목록은 새 복습 정책을 설치하지 않는다', async () => {
  const prev = initialState(); const next = schedule(prev, 'again');
  (apiClient.get as jest.Mock).mockResolvedValue({ personalized: true, review_policy: { first_days: 7, repeat_days: 2 }, cards: [null] });
  await expect(new DailyAssignmentRepository().get()).rejects.toBeDefined();
  expect(applyPersonalReviewPolicy(prev, next, 'again')).toBe(next);
});
